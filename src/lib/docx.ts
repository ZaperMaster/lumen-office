import type { JSONContent } from "@tiptap/core";
import {
  AlignmentType, BorderStyle, Document, ExternalHyperlink, Footer, Header, HeadingLevel, HorizontalPositionAlign, HorizontalPositionRelativeFrom,
  ImageRun, LevelFormat, Packer, PageBreak, PageNumber, TabStopType, TextWrappingSide, TextWrappingType, VerticalPositionRelativeFrom,
  PageOrientation, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
  type IParagraphOptions, type ParagraphChild,
} from "docx";
import { MARGINS, PAGE_SIZES, useSettings } from "@/store/settings";
import { hasContent, withDefaults, type HeaderFooter, type PageLayout } from "@/lib/pageLayout";

/*
 * Exportación a Word (.docx). Va en un módulo aparte para que la librería docx
 * solo se descargue al guardar en ese formato.
 */

/* ---------- DOCX ---------- */

const MM_TO_TWIP = 56.6929;

function hex(c?: string | null) {
  if (!c) return undefined;
  const m = c.trim().match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/i);
  if (m) return m[1].length === 3 ? m[1].split("").map((x) => x + x).join("") : m[1];
  const rgb = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgb) return [rgb[1], rgb[2], rgb[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("");
  return undefined;
}

function firstFont(css?: string | null) {
  if (!css) return undefined;
  return css.split(",")[0].replace(/["']/g, "").replace(" Variable", "").trim();
}

function ptFromSize(v?: string | null): number | undefined {
  if (!v) return undefined;
  const n = parseFloat(v);
  if (Number.isNaN(n)) return undefined;
  return v.endsWith("px") ? n * 0.75 : n;
}

const ALIGN: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
};

const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4];

/** Margen (en EMU) entre una imagen flotante y el texto que la rodea: ~0,3 cm. */
const WRAP_GAP = 114300;

async function imageRun(src: string, width: number | null, align: string): Promise<ImageRun | null> {
  try {
    const res = await fetch(src);
    const blob = await res.blob();
    const data = new Uint8Array(await blob.arrayBuffer());
    const bmp = await createImageBitmap(blob);
    // Mismo ancho que en el editor (px); si no tiene, el natural hasta el ancho de página
    const maxW = 600;
    const w = Math.min(maxW, width ?? bmp.width);
    const scale = w / bmp.width;
    const type = blob.type.includes("png") ? "png" : blob.type.includes("gif") ? "gif" : blob.type.includes("bmp") ? "bmp" : "jpg";
    const transformation = { width: bmp.width * scale, height: bmp.height * scale };
    if (align === "left" || align === "right") {
      // Imagen flotante con el texto alrededor, como en el editor
      return new ImageRun({
        type,
        data,
        transformation,
        floating: {
          horizontalPosition: {
            relative: HorizontalPositionRelativeFrom.MARGIN,
            align: align === "left" ? HorizontalPositionAlign.LEFT : HorizontalPositionAlign.RIGHT,
          },
          verticalPosition: { relative: VerticalPositionRelativeFrom.PARAGRAPH, offset: 0 },
          wrap: { type: TextWrappingType.SQUARE, side: TextWrappingSide.BOTH_SIDES },
          margins: align === "left" ? { right: WRAP_GAP, bottom: WRAP_GAP } : { left: WRAP_GAP, bottom: WRAP_GAP },
        },
      });
    }
    return new ImageRun({ type, data, transformation });
  } catch {
    return null;
  }
}

interface Ctx {
  bulletRef: string;
  numberRef: string;
  numberInstance: number;
}

function inlineRuns(nodes: JSONContent[] | undefined, base: { font?: string; size?: number; italics?: boolean; color?: string } = {}): ParagraphChild[] {
  const out: ParagraphChild[] = [];
  for (const n of nodes ?? []) {
    if (n.type === "hardBreak") {
      out.push(new TextRun({ text: "", break: 1 }));
      continue;
    }
    if (n.type !== "text" || !n.text) continue;
    const marks = n.marks ?? [];
    const has = (t: string) => marks.some((m) => m.type === t);
    const ts = marks.find((m) => m.type === "textStyle")?.attrs ?? {};
    const hl = marks.find((m) => m.type === "highlight")?.attrs;
    const link = marks.find((m) => m.type === "link")?.attrs?.href as string | undefined;
    const size = ptFromSize(ts.fontSize) ?? base.size;
    const run = new TextRun({
      text: n.text,
      bold: has("bold") || undefined,
      italics: has("italic") || base.italics || undefined,
      underline: has("underline") || link ? {} : undefined,
      strike: has("strike") || undefined,
      subScript: has("subscript") || undefined,
      superScript: has("superscript") || undefined,
      color: link ? "2563EB" : hex(ts.color) ?? base.color,
      font: has("code") ? "Consolas" : firstFont(ts.fontFamily) ?? base.font,
      size: size ? Math.round(size * 2) : undefined,
      shading: hl ? { type: ShadingType.CLEAR, color: "auto", fill: hex(hl.color as string) ?? "FFF59D" } : ts.backgroundColor ? { type: ShadingType.CLEAR, color: "auto", fill: hex(ts.backgroundColor) ?? "FFFFFF" } : undefined,
    });
    out.push(link ? new ExternalHyperlink({ link, children: [run] }) : run);
  }
  return out;
}

async function blockToDocx(node: JSONContent, ctx: Ctx, extra: Partial<IParagraphOptions> = {}, listLevel = 0): Promise<(Paragraph | Table)[]> {
  const attrs = node.attrs ?? {};
  const alignment = attrs.textAlign ? ALIGN[attrs.textAlign] : undefined;
  const indent = attrs.indent ? { left: attrs.indent * 720 } : undefined;
  switch (node.type) {
    case "paragraph": {
      const children: ParagraphChild[] = inlineRuns(node.content);
      return [new Paragraph({ children, alignment, indent, ...extra })];
    }
    case "heading":
      return [new Paragraph({ children: inlineRuns(node.content), heading: HEADINGS[attrs.level ?? 1], alignment, indent, ...extra })];
    case "blockquote": {
      const out: (Paragraph | Table)[] = [];
      for (const c of node.content ?? []) {
        out.push(
          ...(await blockToDocx(c, ctx, {
            indent: { left: 567 },
            border: { left: { style: BorderStyle.SINGLE, size: 12, color: "6D4AFF", space: 8 } },
            ...extra,
          })),
        );
      }
      return out;
    }
    case "codeBlock": {
      const lines = (node.content?.map((c) => c.text ?? "").join("") ?? "").split("\n");
      return lines.map(
        (line) =>
          new Paragraph({
            children: [new TextRun({ text: line || " ", font: "Consolas", size: 19, color: "E7E7EF" })],
            shading: { type: ShadingType.CLEAR, color: "auto", fill: "1E1F26" },
            spacing: { before: 0, after: 0 },
          }),
      );
    }
    case "horizontalRule":
      return [new Paragraph({ children: [], border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "BBBBBB", space: 1 } } })];
    case "pageBreak":
      return [new Paragraph({ children: [new PageBreak()] })];
    case "image": {
      const run = attrs.src ? await imageRun(attrs.src, attrs.width ?? null, attrs.align ?? "center") : null;
      if (!run) return [];
      // Las flotantes van en un párrafo vacío: el texto siguiente la rodea
      const floating = attrs.align === "left" || attrs.align === "right";
      return [new Paragraph({ children: [run], alignment: floating ? undefined : AlignmentType.CENTER, spacing: floating ? { after: 0 } : undefined })];
    }
    case "bulletList":
    case "orderedList":
    case "taskList": {
      const out: (Paragraph | Table)[] = [];
      const instance = node.type === "orderedList" ? ++ctx.numberInstance : 0;
      for (const item of node.content ?? []) {
        let first = true;
        for (const c of item.content ?? []) {
          if (["bulletList", "orderedList", "taskList"].includes(c.type ?? "")) {
            out.push(...(await blockToDocx(c, ctx, {}, listLevel + 1)));
            continue;
          }
          if (first && c.type === "paragraph") {
            first = false;
            if (node.type === "taskList") {
              const box = item.attrs?.checked ? "☑ " : "☐ ";
              out.push(new Paragraph({ children: [new TextRun(box), ...inlineRuns(c.content)], indent: { left: 360 + listLevel * 360 } }));
            } else {
              out.push(
                new Paragraph({
                  children: inlineRuns(c.content),
                  numbering:
                    node.type === "orderedList"
                      ? { reference: ctx.numberRef, level: Math.min(listLevel, 8), instance }
                      : { reference: ctx.bulletRef, level: Math.min(listLevel, 8) },
                }),
              );
            }
          } else {
            out.push(...(await blockToDocx(c, ctx, { indent: { left: 720 + listLevel * 360 } }, listLevel)));
          }
        }
      }
      return out;
    }
    case "table": {
      const rows = await Promise.all(
        (node.content ?? []).map(async (row) => {
          const cells = await Promise.all(
            (row.content ?? []).map(async (cell) => {
              const children: (Paragraph | Table)[] = [];
              for (const c of cell.content ?? []) children.push(...(await blockToDocx(c, ctx)));
              return new TableCell({
                children: children.length ? children : [new Paragraph("")],
                columnSpan: (cell.attrs?.colspan ?? 1) > 1 ? cell.attrs?.colspan : undefined,
                rowSpan: (cell.attrs?.rowspan ?? 1) > 1 ? cell.attrs?.rowspan : undefined,
                shading: cell.type === "tableHeader" ? { type: ShadingType.CLEAR, color: "auto", fill: "F1F1F4" } : undefined,
              });
            }),
          );
          return new TableRow({ children: cells, tableHeader: row.content?.[0]?.type === "tableHeader" });
        }),
      );
      return [new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }), new Paragraph("")];
    }
    default:
      return node.content ? (await Promise.all(node.content.map((c) => blockToDocx(c, ctx)))).flat() : [];
  }
}

/**
 * Párrafo de encabezado o pie con sus tres partes (izquierda, centro y derecha),
 * usando tabulaciones como hace Word. Los números de página son campos de Word.
 */
function hfParagraph(hf: HeaderFooter, title: string, author: string, widthTwips: number, fontPt: number): Paragraph {
  const parts = (text: string) => {
    const out: (string | (typeof PageNumber)[keyof typeof PageNumber])[] = [];
    const resolved = text.replaceAll("{titulo}", title || "Documento sin título").replaceAll("{fecha}", new Date().toLocaleDateString("es-ES")).replaceAll("{autor}", author);
    for (const piece of resolved.split(/(\{paginas?\})/)) {
      if (piece === "{pagina}") out.push(PageNumber.CURRENT);
      else if (piece === "{paginas}") out.push(PageNumber.TOTAL_PAGES);
      else if (piece) out.push(piece);
    }
    return out;
  };
  const size = Math.round(fontPt * 2);
  return new Paragraph({
    tabStops: [
      { type: TabStopType.CENTER, position: Math.round(widthTwips / 2) },
      { type: TabStopType.RIGHT, position: widthTwips },
    ],
    children: [
      new TextRun({ children: parts(hf.left), size }),
      new TextRun({ children: ["\t", ...parts(hf.center)], size }),
      new TextRun({ children: ["\t", ...parts(hf.right)], size }),
    ],
  });
}

export async function buildDocx(content: JSONContent, title: string, pageLayout?: PageLayout | null): Promise<Blob> {
  const s = useSettings.getState();
  const size = PAGE_SIZES[s.pageSize];
  const margin = MARGINS[s.margins];
  const landscape = s.orientation === "landscape";
  const layout = withDefaults(pageLayout);
  // Ancho del texto (sin márgenes), para colocar el centro y la derecha del encabezado
  const textWidth = Math.round(((landscape ? size.h : size.w) - 2 * margin.h) * MM_TO_TWIP);
  const hasHeader = hasContent(layout.header);
  const hasFooter = hasContent(layout.footer);
  const emptyHeader = () => new Header({ children: [new Paragraph("")] });
  const emptyFooter = () => new Footer({ children: [new Paragraph("")] });
  const ctx: Ctx = { bulletRef: "lumen-bullets", numberRef: "lumen-numbers", numberInstance: 0 };
  const children: (Paragraph | Table)[] = [];
  for (const n of content.content ?? []) children.push(...(await blockToDocx(n, ctx)));

  const bullets = ["•", "◦", "▪"];
  const numberFormats = [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN];
  const levels = (kind: "bullet" | "number") =>
    Array.from({ length: 9 }, (_, level) => ({
      level,
      format: kind === "bullet" ? LevelFormat.BULLET : numberFormats[level % 3],
      text: kind === "bullet" ? bullets[level % 3] : `%${level + 1}.`,
      alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 720 + level * 360, hanging: 360 } } },
    }));

  const doc = new Document({
    creator: s.userName || "Lumen Office",
    title: title || "Documento",
    styles: {
      default: {
        document: {
          run: { font: firstFont(s.fontFamily) ?? "Calibri", size: Math.round(s.fontSize * 2) },
          paragraph: { spacing: { line: Math.round(s.lineHeight * 240), after: Math.round(s.paraSpacing * s.fontSize * 20) } },
        },
      },
    },
    numbering: {
      config: [
        { reference: ctx.bulletRef, levels: levels("bullet") },
        { reference: ctx.numberRef, levels: levels("number") },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: Math.round(size.w * MM_TO_TWIP),
              height: Math.round(size.h * MM_TO_TWIP),
              orientation: landscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
            },
            margin: {
              top: Math.round(margin.v * MM_TO_TWIP),
              bottom: Math.round(margin.v * MM_TO_TWIP),
              left: Math.round(margin.h * MM_TO_TWIP),
              right: Math.round(margin.h * MM_TO_TWIP),
              // Distancia del encabezado y el pie al borde, como Word (1,25 cm)
              header: Math.round(Math.min(12.7, margin.v / 2) * MM_TO_TWIP),
              footer: Math.round(Math.min(12.7, margin.v / 2) * MM_TO_TWIP),
            },
            pageNumbers: { start: layout.startNumber },
          },
          titlePage: layout.differentFirstPage,
        },
        headers: hasHeader
          ? {
              default: new Header({ children: [hfParagraph(layout.header, title, s.userName, textWidth, 9.5)] }),
              ...(layout.differentFirstPage ? { first: emptyHeader() } : {}),
            }
          : undefined,
        footers: hasFooter
          ? {
              default: new Footer({ children: [hfParagraph(layout.footer, title, s.userName, textWidth, 9.5)] }),
              ...(layout.differentFirstPage ? { first: emptyFooter() } : {}),
            }
          : undefined,
        children: children.length ? children : [new Paragraph("")],
      },
    ],
  });
  return Packer.toBlob(doc);
}

