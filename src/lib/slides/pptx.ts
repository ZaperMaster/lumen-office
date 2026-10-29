import PptxGenJS from "pptxgenjs";
import JSZip from "jszip";
import { SLIDE_H, SLIDE_W, esc, sid, theme as getTheme, type Deck, type ShapeKind, type Slide, type SlideEl } from "@/lib/slides/model";

/*
 * PowerPoint (.pptx). Exportar usa pptxgenjs; importar lee el XML de las
 * diapositivas (texto, formas, imágenes y fondos) con JSZip.
 */

const PX_PER_IN = 96;
const inch = (px: number) => Math.round((px / PX_PER_IN) * 1000) / 1000;
const hex = (c?: string) => (c && /^#[0-9a-f]{6}/i.test(c) ? c.slice(1, 7).toUpperCase() : undefined);
/** Transparencia de un color #rrggbbaa (0-100). */
const alphaOf = (c?: string) => (c && c.length === 9 ? Math.round((1 - parseInt(c.slice(7, 9), 16) / 255) * 100) : 0);
const firstFont = (css?: string) => css?.split(",")[0].replace(/["']/g, "").replace(" Variable", "").trim();

/* ------------------------------------------------------------------ */
/*  Exportar                                                           */
/* ------------------------------------------------------------------ */

type Run = { text: string; options: PptxGenJS.TextPropsOptions };

/** Convierte el HTML de un cuadro de texto en párrafos con formato para PowerPoint. */
function htmlToRuns(html: string, base: PptxGenJS.TextPropsOptions): Run[] {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const runs: Run[] = [];
  const walkInline = (node: Node, fmt: PptxGenJS.TextPropsOptions, para: Run[]) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent ?? "").replace(/\s+/g, " ");
      if (text) para.push({ text, options: { ...fmt } });
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    const tag = node.tagName.toLowerCase();
    if (tag === "br") {
      para.push({ text: "", options: { ...fmt, breakLine: true } });
      return;
    }
    const f = { ...fmt };
    if (tag === "b" || tag === "strong" || /font-weight:\s*(bold|[6-9]00)/.test(node.getAttribute("style") ?? "")) f.bold = true;
    if (tag === "i" || tag === "em" || /font-style:\s*italic/.test(node.getAttribute("style") ?? "")) f.italic = true;
    if (tag === "u" || /text-decoration[^;]*underline/.test(node.getAttribute("style") ?? "")) f.underline = { style: "sng" };
    const color = /(?:^|;)\s*color:\s*(#[0-9a-f]{6}|rgb\([^)]+\))/i.exec(node.getAttribute("style") ?? "")?.[1] ?? node.getAttribute("color") ?? undefined;
    if (color) {
      const m = /rgb\((\d+),\s*(\d+),\s*(\d+)/.exec(color);
      f.color = m ? [m[1], m[2], m[3]].map((x) => Number(x).toString(16).padStart(2, "0")).join("").toUpperCase() : hex(color);
    }
    node.childNodes.forEach((ch) => walkInline(ch, f, para));
  };
  const pushPara = (nodes: NodeListOf<ChildNode> | ChildNode[], extra: PptxGenJS.TextPropsOptions) => {
    const para: Run[] = [];
    nodes.forEach((n) => walkInline(n, base, para));
    if (!para.length) para.push({ text: "", options: { ...base } });
    para[0].options = { ...para[0].options, ...extra };
    para[para.length - 1].options = { ...para[para.length - 1].options, breakLine: true };
    runs.push(...para);
  };
  const walkBlock = (el: Element) => {
    el.childNodes.forEach((n) => {
      if (!(n instanceof HTMLElement)) {
        if ((n.textContent ?? "").trim()) pushPara([n], {});
        return;
      }
      const tag = n.tagName.toLowerCase();
      if (tag === "ul" || tag === "ol") {
        n.querySelectorAll(":scope > li").forEach((li) => pushPara(li.childNodes, { bullet: tag === "ol" ? { type: "number" } : true }));
      } else if (tag === "p" || tag === "div" || tag === "li") pushPara(n.childNodes, {});
      else pushPara([n], {});
    });
  };
  walkBlock(doc.body.firstElementChild!);
  if (runs.length) delete runs[runs.length - 1].options.breakLine;
  return runs;
}

const SHAPE_MAP: Record<ShapeKind, PptxGenJS.ShapeType> = {
  rect: "rect" as PptxGenJS.ShapeType,
  roundRect: "roundRect" as PptxGenJS.ShapeType,
  ellipse: "ellipse" as PptxGenJS.ShapeType,
  triangle: "triangle" as PptxGenJS.ShapeType,
  diamond: "diamond" as PptxGenJS.ShapeType,
  arrow: "rightArrow" as PptxGenJS.ShapeType,
  star: "star5" as PptxGenJS.ShapeType,
  line: "line" as PptxGenJS.ShapeType,
};

export async function buildPptx(deck: Deck, title: string): Promise<Uint8Array> {
  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_WIDE"; // 13,33 × 7,5 pulgadas = 1280 × 720 px
  pres.title = title || "Presentación";
  pres.company = "Lumen Office";
  const t = getTheme(deck.theme);
  for (const s of deck.slides) {
    const slide = pres.addSlide();
    slide.background = s.bgImage ? { data: s.bgImage } : { color: hex(s.bg ?? t.bg) ?? "FFFFFF" };
    if (t.band) slide.addShape("rect" as PptxGenJS.ShapeType, { x: 0, y: inch(SLIDE_H - 10), w: inch(SLIDE_W), h: inch(10), fill: { color: hex(t.band)! }, line: { type: "none" } });
    for (const el of s.els) {
      const pos = { x: inch(el.x), y: inch(el.y), w: inch(el.w), h: inch(el.h), rotate: el.rot || undefined };
      const shadow = el.shadow ? ({ type: "outer", blur: 8, offset: 4, angle: 90, color: "000000", opacity: 0.3 } as PptxGenJS.ShadowProps) : undefined;
      if (el.type === "image" && el.src) {
        slide.addImage({
          data: el.src,
          ...pos,
          transparency: el.opacity !== undefined ? Math.round((1 - el.opacity) * 100) : undefined,
          rounding: el.circle || undefined,
          flipH: el.flipH || undefined,
          flipV: el.flipV || undefined,
          shadow,
          sizing: el.fit && el.fit !== "fill" ? { type: el.fit, w: pos.w, h: pos.h } : undefined,
        });
        continue;
      }
      const fontColor = el.color ?? (el.role === "title" ? t.title : el.type === "shape" && !(el.fill === "transparent" || el.fill?.length === 9) ? "#ffffff" : t.text);
      const base: PptxGenJS.TextPropsOptions = {
        fontSize: Math.round((el.fontSize ?? 28) * 0.75 * 10) / 10,
        fontFace: firstFont(el.font ?? (el.role === "title" ? t.titleFont : t.bodyFont)),
        color: hex(fontColor),
        bold: el.bold || undefined,
      };
      const textOpts: PptxGenJS.TextPropsOptions = {
        ...pos,
        align: el.align ?? "left",
        valign: el.valign === "middle" ? "middle" : el.valign === "bottom" ? "bottom" : "top",
        margin: [6, 10, 6, 10],
        fit: "none",
        lineSpacingMultiple: el.lineHeight,
        shadow,
      };
      const runs = el.html ? htmlToRuns(el.html, base) : [];
      if (el.type === "shape") {
        const shapeOpts = {
          fill: el.fill === "transparent" ? { type: "none" as const } : { color: hex(el.fill ?? t.accent) ?? "4F7CFF", transparency: alphaOf(el.fill) },
          line: el.strokeW || el.shape === "line" ? { color: hex(el.stroke ?? t.accent) ?? "000000", width: Math.max(0.75, (el.strokeW || 3) * 0.75) } : { type: "none" as const },
        };
        const radius = el.radius ? { rectRadius: Math.min(0.5, el.radius / Math.min(el.w, el.h)) } : {};
        if (runs.some((r) => r.text.trim())) slide.addText(runs, { ...textOpts, shape: SHAPE_MAP[el.shape ?? "rect"], ...shapeOpts, ...radius });
        else slide.addShape(SHAPE_MAP[el.shape ?? "rect"], { ...pos, ...shapeOpts, ...radius, shadow });
        continue;
      }
      // Cuadro de texto con relleno o contorno
      const box = {
        ...(el.fill && el.fill !== "transparent" ? { fill: { color: hex(el.fill) ?? "FFFFFF", transparency: alphaOf(el.fill) } } : {}),
        ...(el.strokeW ? { line: { color: hex(el.stroke ?? t.accent) ?? "000000", width: el.strokeW * 0.75 } } : {}),
        ...(el.radius && (el.fill || el.strokeW) ? { shape: "roundRect" as PptxGenJS.ShapeType, rectRadius: Math.min(0.5, el.radius / Math.min(el.w, el.h)) } : {}),
      };
      if (runs.some((r) => r.text.trim())) slide.addText(runs, { ...textOpts, ...box });
    }
    if (s.notes) slide.addNotes(s.notes);
  }
  const out = (await pres.write({ outputType: "uint8array" })) as Uint8Array;
  return out;
}

/* ------------------------------------------------------------------ */
/*  Importar                                                           */
/* ------------------------------------------------------------------ */

const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const P = "http://schemas.openxmlformats.org/presentationml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

const parseXml = (s: string) => new DOMParser().parseFromString(s, "application/xml");
const kids = (el: Element | Document, ns: string, name: string) => [...el.getElementsByTagNameNS(ns, name)];
const child = (el: Element | null | undefined, ns: string, name: string) => (el ? ([...el.children].find((c) => c.namespaceURI === ns && c.localName === name) ?? null) : null);

function solid(el: Element | null): string | undefined {
  const fill = el ? child(el, A, "solidFill") : null;
  const c = child(fill, A, "srgbClr")?.getAttribute("val");
  return c ? `#${c.toLowerCase()}` : undefined;
}

async function rels(zip: JSZip, path: string): Promise<Record<string, string>> {
  const dir = path.slice(0, path.lastIndexOf("/"));
  const file = `${dir}/_rels/${path.slice(path.lastIndexOf("/") + 1)}.rels`;
  const xml = await zip.file(file)?.async("string");
  if (!xml) return {};
  const out: Record<string, string> = {};
  for (const r of kids(parseXml(xml), "http://schemas.openxmlformats.org/package/2006/relationships", "Relationship")) {
    const target = r.getAttribute("Target") ?? "";
    // Rutas relativas a la carpeta del archivo
    const parts = (target.startsWith("/") ? target.slice(1) : `${dir}/${target}`).split("/");
    const norm: string[] = [];
    for (const p of parts) {
      if (p === "..") norm.pop();
      else if (p !== ".") norm.push(p);
    }
    out[r.getAttribute("Id") ?? ""] = norm.join("/");
  }
  return out;
}

function paragraphsToHtml(txBody: Element | null): { html: string; size?: number; color?: string; bold?: boolean; align?: SlideEl["align"] } {
  if (!txBody) return { html: "" };
  let size: number | undefined;
  let color: string | undefined;
  let bold: boolean | undefined;
  let align: SlideEl["align"];
  const blocks: { html: string; bullet: boolean; numbered: boolean }[] = [];
  for (const p of kids(txBody, A, "p")) {
    const pPr = child(p, A, "pPr");
    const algn = pPr?.getAttribute("algn");
    if (algn && !align) align = algn === "ctr" ? "center" : algn === "r" ? "right" : "left";
    const bullet = !!child(pPr, A, "buChar") || !!child(pPr, A, "buAutoNum");
    let html = "";
    for (const r of [...p.children]) {
      if (r.localName === "br") {
        html += "<br>";
        continue;
      }
      if (r.localName !== "r" && r.localName !== "fld") continue;
      const rPr = child(r, A, "rPr");
      const text = esc(child(r, A, "t")?.textContent ?? "");
      if (!text) continue;
      const sz = rPr?.getAttribute("sz");
      if (sz && !size) size = Math.round((Number(sz) / 100) / 0.75);
      const c = solid(rPr);
      if (c && !color) color = c;
      let piece = text;
      if (rPr?.getAttribute("b") === "1") {
        if (bold === undefined) bold = true;
        piece = `<b>${piece}</b>`;
      }
      if (rPr?.getAttribute("i") === "1") piece = `<i>${piece}</i>`;
      if (rPr?.getAttribute("u") && rPr.getAttribute("u") !== "none") piece = `<u>${piece}</u>`;
      if (c && c !== color) piece = `<span style="color:${c}">${piece}</span>`;
      html += piece;
    }
    blocks.push({ html, bullet, numbered: !!child(pPr, A, "buAutoNum") });
  }
  // Agrupa las viñetas seguidas en una lista
  let out = "";
  let open: "ul" | "ol" | null = null;
  for (const b of blocks) {
    const want = b.bullet ? (b.numbered ? "ol" : "ul") : null;
    if (open && want !== open) {
      out += `</${open}>`;
      open = null;
    }
    if (want && !open) {
      out += `<${want}>`;
      open = want;
    }
    out += want ? `<li>${b.html}</li>` : `<p>${b.html || "<br>"}</p>`;
  }
  if (open) out += `</${open}>`;
  return { html: out, size, color, bold: bold && blocks.length === 1 ? true : undefined, align };
}

const PRST: Record<string, ShapeKind> = {
  rect: "rect", roundRect: "roundRect", ellipse: "ellipse", triangle: "triangle", diamond: "diamond",
  rightArrow: "arrow", star5: "star", line: "line", straightConnector1: "line",
};

export async function readPptx(data: ArrayBuffer): Promise<Deck> {
  const zip = await JSZip.loadAsync(data);
  const presXml = parseXml((await zip.file("ppt/presentation.xml")?.async("string")) ?? "");
  const sz = kids(presXml, P, "sldSz")[0];
  const cx = Number(sz?.getAttribute("cx") ?? 12192000);
  const cy = Number(sz?.getAttribute("cy") ?? 6858000);
  const k = SLIDE_W / cx;
  const ky = SLIDE_H / cy;
  const presRels = await rels(zip, "ppt/presentation.xml");
  const ids = kids(presXml, P, "sldId").map((s) => s.getAttributeNS(R, "id") ?? "");
  const slides: Slide[] = [];

  for (const rid of ids) {
    const path = presRels[rid];
    const xml = path && (await zip.file(path)?.async("string"));
    if (!xml) continue;
    const doc = parseXml(xml);
    const srels = await rels(zip, path);
    const slide: Slide = { id: sid(), els: [] };
    const bgPr = kids(doc, P, "bgPr")[0];
    const bg = solid(bgPr ?? null);
    if (bg) slide.bg = bg;

    const pos = (el: Element) => {
      const xfrm = kids(el, A, "xfrm")[0];
      const off = child(xfrm, A, "off");
      const ext = child(xfrm, A, "ext");
      if (!off || !ext) return null;
      return {
        x: Number(off.getAttribute("x")) * k,
        y: Number(off.getAttribute("y")) * ky,
        w: Math.max(10, Number(ext.getAttribute("cx")) * k),
        h: Math.max(10, Number(ext.getAttribute("cy")) * ky),
        rot: xfrm?.getAttribute("rot") ? Math.round(Number(xfrm.getAttribute("rot")) / 60000) : undefined,
      };
    };

    const tree = kids(doc, P, "spTree")[0];
    const walk = async (parent: Element) => {
      for (const node of [...parent.children]) {
        if (node.localName === "grpSp") {
          await walk(node);
          continue;
        }
        if (node.localName === "pic") {
          const blip = kids(node, A, "blip")[0];
          const target = srels[blip?.getAttributeNS(R, "embed") ?? ""];
          const file = target && zip.file(target);
          const p = pos(node);
          if (!file || !p) continue;
          const ext = target.split(".").pop()?.toLowerCase();
          const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "gif" ? "image/gif" : ext === "svg" ? "image/svg+xml" : "image/png";
          const b64 = await file.async("base64");
          slide.els.push({ id: sid(), type: "image", src: `data:${mime};base64,${b64}`, ...p });
          continue;
        }
        if (node.localName !== "sp" && node.localName !== "cxnSp") continue;
        const ph = kids(node, P, "ph")[0];
        const phType = ph?.getAttribute("type") ?? (ph ? "body" : null);
        let p = pos(node);
        // Marcadores sin posición propia (la heredan del diseño): se colocan en su sitio típico
        if (!p && phType) {
          p = phType === "title" || phType === "ctrTitle" ? { x: 80, y: 50, w: 1120, h: 110, rot: undefined } : phType === "subTitle" ? { x: 200, y: 390, w: 880, h: 80, rot: undefined } : { x: 80, y: 180, w: 1120, h: 480, rot: undefined };
        }
        if (!p) continue;
        const spPr = kids(node, P, "spPr")[0] ?? null;
        const prst = spPr ? child(spPr, A, "prstGeom")?.getAttribute("prst") : null;
        const fill = solid(spPr);
        const ln = spPr ? child(spPr, A, "ln") : null;
        const stroke = solid(ln);
        const text = paragraphsToHtml(kids(node, P, "txBody")[0] ?? null);
        const role = phType === "title" || phType === "ctrTitle" ? "title" : phType === "subTitle" ? "subtitle" : phType ? "body" : undefined;
        const bodyPr = kids(node, A, "bodyPr")[0];
        const anchor = bodyPr?.getAttribute("anchor");
        const isShape = !!(fill || stroke || (prst && prst !== "rect")) && !role;
        if (!isShape && !text.html.replace(/<[^>]+>/g, "").trim()) continue;
        slide.els.push({
          id: sid(),
          type: isShape ? "shape" : "text",
          shape: isShape ? (PRST[prst ?? "rect"] ?? "rect") : undefined,
          fill: isShape ? (fill ?? "transparent") : undefined,
          stroke,
          strokeW: stroke ? Math.max(1, Math.round(Number(ln?.getAttribute("w") ?? 12700) / 9525)) : undefined,
          html: text.html,
          role,
          fontSize: text.size ?? (role === "title" ? 44 : 24),
          color: text.color,
          bold: text.bold,
          align: text.align ?? (phType === "ctrTitle" || phType === "subTitle" ? "center" : "left"),
          valign: anchor === "ctr" ? "middle" : anchor === "b" ? "bottom" : role === "title" ? "middle" : "top",
          ...p,
        });
      }
    };
    if (tree) await walk(tree);

    // Notas del orador
    const notesPath = Object.values(srels).find((t) => t.includes("notesSlide"));
    const notesXml = notesPath && (await zip.file(notesPath)?.async("string"));
    if (notesXml) {
      const nd = parseXml(notesXml);
      const body = kids(nd, P, "sp").find((sp) => kids(sp, P, "ph")[0]?.getAttribute("type") === "body");
      const txt = body ? kids(body, A, "t").map((t) => t.textContent).join(" ").trim() : "";
      if (txt) slide.notes = txt;
    }
    slides.push(slide);
  }
  if (!slides.length) throw new Error("La presentación no tiene diapositivas.");
  return { theme: "clean", slides };
}
