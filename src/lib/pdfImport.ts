/*
 * Abrir un PDF como documento editable.
 *
 * pdf.js (de Mozilla) da cada trozo de texto con su posición, tamaño y fuente;
 * con eso se rehace el documento: títulos (por el tamaño de letra), párrafos
 * (por la separación entre líneas), listas, negrita y texto centrado. Los números
 * de página y los encabezados o pies que se repiten en todas las páginas se quitan.
 *
 * No incluye reconocimiento de texto (OCR): un PDF escaneado, que solo tiene
 * imágenes, no tiene texto que leer.
 */

/** Un trozo de texto del PDF (coordenadas con el origen abajo a la izquierda, como en PDF) */
export interface PdfText {
  str: string;
  x: number;
  y: number;
  /** Ancho del trozo */
  w: number;
  /** Tamaño de letra */
  size: number;
  bold: boolean;
}

export interface PdfPage {
  width: number;
  height: number;
  items: PdfText[];
}

interface Line {
  segs: { text: string; bold: boolean }[];
  x: number;
  xEnd: number;
  y: number;
  size: number;
  page: number;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const lineText = (l: Line) => l.segs.map((s) => s.text).join("");
const BULLET = /^\s*([•●▪◦‣∙·*–-])\s+/;
const NUMBERED = /^\s*(\d{1,3}|[a-z])[.)]\s+/i;
const PAGE_NUMBER = /^\s*(p[áa]g(ina)?\.?\s*)?\d{1,4}(\s*(de|of|\/)\s*\d{1,4})?\s*$/i;

/** Junta los trozos de texto de una página en líneas. */
function pageLines(page: PdfPage, pageIndex: number): Line[] {
  const items = page.items.filter((it) => it.str.trim() !== "" || it.str === " ");
  items.sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: { items: PdfText[]; y: number; size: number }[] = [];
  for (const it of items) {
    const line = lines.find((l) => Math.abs(l.y - it.y) < Math.max(2, Math.min(l.size, it.size) * 0.45));
    if (line) {
      line.items.push(it);
      line.size = Math.max(line.size, it.size);
    } else lines.push({ items: [it], y: it.y, size: it.size });
  }
  return lines.map((l) => {
    l.items.sort((a, b) => a.x - b.x);
    const segs: Line["segs"] = [];
    let end = -Infinity;
    for (const it of l.items) {
      // Espacio entre trozos separados que no lo traen
      const gap = it.x - end;
      let text = it.str;
      const prev = segs[segs.length - 1];
      if (prev && gap > l.size * 0.18 && !/\s$/.test(prev.text) && !/^\s/.test(text)) text = ` ${text}`;
      if (prev && prev.bold === it.bold) prev.text += text;
      else segs.push({ text, bold: it.bold });
      end = Math.max(end, it.x + it.w);
    }
    const x = l.items[0].x;
    return { segs, x, xEnd: end, y: l.y, size: l.size, page: pageIndex };
  });
}

/** Líneas que no son contenido: números de página y encabezados o pies repetidos. */
function chrome(pages: PdfPage[], all: Line[][]): Set<Line> {
  const drop = new Set<Line>();
  const edge = (l: Line) => {
    const h = pages[l.page].height;
    return l.y > h * 0.9 || l.y < h * 0.1;
  };
  const key = (l: Line) => lineText(l).replace(/\d+/g, "#").replace(/\s+/g, " ").trim().toLowerCase();
  const count = new Map<string, number>();
  for (const lines of all) for (const k of new Set(lines.filter(edge).map(key))) count.set(k, (count.get(k) ?? 0) + 1);
  for (const lines of all) {
    for (const l of lines) {
      if (!edge(l)) continue;
      const repeated = pages.length >= 3 && (count.get(key(l)) ?? 0) >= Math.ceil(pages.length * 0.6);
      if (PAGE_NUMBER.test(lineText(l)) || repeated) drop.add(l);
    }
  }
  return drop;
}

/** Tamaño de letra más habitual (el del texto normal). */
function bodySize(lines: Line[]): number {
  const weight = new Map<number, number>();
  for (const l of lines) {
    const s = Math.round(l.size * 2) / 2;
    weight.set(s, (weight.get(s) ?? 0) + lineText(l).length);
  }
  return [...weight.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 12;
}

type Block =
  | { kind: "h"; level: 1 | 2 | 3; text: string; center: boolean }
  | { kind: "p"; html: string; plain: string; center: boolean; last: Line; joinPrev: boolean }
  | { kind: "li"; ordered: boolean; html: string; last: Line; soft?: boolean };

const segsHtml = (segs: Line["segs"]) => {
  // Los espacios de los extremos van fuera de la negrita
  const out = segs
    .map((s) => {
      if (!s.bold || !s.text.trim()) return esc(s.text);
      const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(s.text)!;
      return `${lead}<strong>${esc(core)}</strong>${trail}`;
    })
    .join("");
  return out.replace(/<\/strong>(\s*)<strong>/g, "$1");
};

/** Convierte las páginas leídas en el HTML del documento. */
export function layoutToHtml(pages: PdfPage[]): string {
  const all = pages.map(pageLines);
  const drop = chrome(pages, all);
  const lines = all.flat().filter((l) => !drop.has(l) && lineText(l).trim());
  if (!lines.length) return "";
  const body = bodySize(lines);
  // Margen izquierdo más habitual y dónde acaban las líneas llenas, por página
  const counts = new Map<number, number>();
  for (const l of lines) counts.set(Math.round(l.x), (counts.get(Math.round(l.x)) ?? 0) + 1);
  const margin = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
  const right = pages.map((_, i) => Math.max(0, ...lines.filter((l) => l.page === i).map((l) => l.xEnd)));
  const full = (l: Line) => l.xEnd > right[l.page] - l.size * 2.5;
  const blocks: Block[] = [];
  let prev: Line | null = null;

  for (const l of lines) {
    const text = lineText(l).replace(/\s+/g, " ").trim();
    const w = pages[l.page].width;
    const center = Math.abs((l.x + l.xEnd) / 2 - w / 2) < w * 0.05 && l.xEnd - l.x < w * 0.75 && l.x > w * 0.15;
    const ratio = l.size / body;
    const allBold = l.segs.every((s) => s.bold || !s.text.trim());
    const last = blocks[blocks.length - 1];
    const gap = prev && prev.page === l.page ? prev.y - l.y : Infinity;
    const close = gap <= Math.max(prev?.size ?? 0, l.size) * 1.75;

    // Títulos: letra más grande, o una línea corta en negrita separada del resto
    const isHeading = ratio >= 1.15 || (allBold && text.length < 90 && !close && !/[.,;:]$/.test(text) && lines.length > 1);
    if (isHeading) {
      const level: 1 | 2 | 3 = ratio >= 1.6 ? 1 : ratio >= 1.3 ? 2 : 3;
      if (last?.kind === "h" && last.level === level && close && prev && Math.abs(prev.size - l.size) < 0.6) last.text += ` ${text}`;
      else blocks.push({ kind: "h", level, text, center });
      prev = l;
      continue;
    }

    // Listas
    const bullet = BULLET.exec(text);
    const numbered = bullet ? null : NUMBERED.exec(text);
    if (bullet || numbered) {
      const m = (bullet || numbered)!;
      const segs = [...l.segs];
      // Quita la viñeta o el número del principio
      let cut = m[0].length;
      while (cut > 0 && segs.length) {
        const s = segs[0].text.replace(/^\s+/, "");
        if (s.length <= cut) {
          cut -= s.length;
          segs.shift();
        } else {
          segs[0] = { ...segs[0], text: s.slice(cut) };
          cut = 0;
        }
      }
      blocks.push({ kind: "li", ordered: !!numbered, html: segsHtml(segs).trim(), last: l });
      prev = l;
      continue;
    }

    // Líneas sangradas: elementos de una lista cuya viñeta es un dibujo (Word, Chrome… no la escriben como texto)
    const sameSize = !!prev && Math.abs(prev.size - l.size) < 0.6;
    const indented = l.x > margin + l.size * 1.2 && !center && Math.abs(l.size - body) < 0.6;
    if (indented) {
      if (last?.kind === "li" && last.soft && close && Math.abs(last.last.x - l.x) < 2 && full(last.last)) {
        // La línea anterior llegó al final: es el mismo elemento, que sigue
        last.html += ` ${segsHtml(l.segs).trim()}`;
        last.last = l;
      } else {
        blocks.push({ kind: "li", ordered: false, html: segsHtml(l.segs).trim(), last: l, soft: true });
      }
      prev = l;
      continue;
    }

    // Continuación de un elemento de lista (línea sangrada justo debajo)
    if (last?.kind === "li" && close && l.x > last.last.x + 2) {
      last.html += ` ${segsHtml(l.segs).trim()}`;
      last.last = l;
      prev = l;
      continue;
    }

    // Párrafos: se unen las líneas seguidas del mismo tamaño
    const continues =
      last?.kind === "p" &&
      sameSize &&
      (close ||
        // Un párrafo que sigue en la página siguiente
        (prev!.page !== l.page && !/[.!?:»”")]$/.test(last.plain)));
    if (continues) {
      const p = last as Extract<Block, { kind: "p" }>;
      const html = segsHtml(l.segs).trim();
      // Palabra partida con guion al final de la línea
      if (/[a-záéíóúñü]-$/i.test(p.plain) && /^[a-záéíóúñü]/.test(text)) {
        p.html = p.html.replace(/-(<\/strong>)?$/, "$1") + html;
        p.plain = p.plain.slice(0, -1) + text;
      } else {
        p.html += ` ${html}`;
        p.plain += ` ${text}`;
      }
      p.center = p.center && center;
      p.last = l;
    } else {
      blocks.push({ kind: "p", html: segsHtml(l.segs).trim(), plain: text, center, last: l, joinPrev: close && sameSize });
    }
    prev = l;
  }

  // Una sola línea sangrada no es una lista: es la primera línea de un párrafo
  const isSoft = (b?: Block) => b?.kind === "li" && !!b.soft;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.kind !== "li" || !b.soft || isSoft(blocks[i - 1]) || isSoft(blocks[i + 1])) continue;
    const plain = b.html.replace(/<[^>]*>/g, "");
    const next = blocks[i + 1];
    if (next?.kind === "p" && next.joinPrev) blocks.splice(i, 2, { ...next, html: `${b.html} ${next.html}`, plain: `${plain} ${next.plain}` });
    else blocks[i] = { kind: "p", html: b.html, plain, center: false, last: b.last, joinPrev: false };
  }

  // HTML final: las listas seguidas se agrupan
  let html = "";
  let list: "ul" | "ol" | null = null;
  const close = () => {
    if (list) html += `</${list}>`;
    list = null;
  };
  for (const b of blocks) {
    if (b.kind === "li") {
      const tag = b.ordered ? "ol" : "ul";
      if (list !== tag) {
        close();
        html += `<${tag}>`;
        list = tag;
      }
      html += `<li><p>${b.html}</p></li>`;
      continue;
    }
    close();
    const style = b.center ? ' style="text-align:center"' : "";
    if (b.kind === "h") html += `<h${b.level}${style}>${esc(b.text)}</h${b.level}>`;
    else html += `<p${style}>${b.html}</p>`;
  }
  close();
  return html;
}

/** Lee un PDF y devuelve el HTML del documento. */
export async function readPdf(data: ArrayBuffer): Promise<{ html: string; pages: number }> {
  const pdfjs = await import("pdfjs-dist");
  const { default: workerUrl } = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  // Sin formularios XFA (que pueden traer código) y sin descargar nada externo
  // fontExtraProperties: para conocer el nombre real de cada fuente (y saber cuáles son negrita)
  const task = pdfjs.getDocument({ data: new Uint8Array(data), enableXfa: false, fontExtraProperties: true });
  const doc = await task.promise;
  const pages: PdfPage[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const view = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      // Las fuentes se cargan con la lista de operaciones; así se sabe cuáles son negrita
      await page.getOperatorList().catch(() => null);
      // Nombre real de cada fuente (p. ej. «Calibri-Bold»)
      const names = new Map<string, string>();
      try {
        for (const [id, font] of page.commonObjs as unknown as Iterable<[string, { name?: string } | null]>) names.set(id, font?.name ?? "");
      } catch {
        // Sin información de fuentes: no se marca negrita
      }
      const isBold = (fontName: string) => /bold|black|heavy|semibold|demi/i.test(`${names.get(fontName) ?? ""} ${content.styles[fontName]?.fontFamily ?? ""}`);
      const items: PdfText[] = [];
      for (const it of content.items) {
        if (!("str" in it)) continue;
        const [, , c, d, x, y] = it.transform as number[];
        items.push({ str: it.str, x, y, w: it.width, size: Math.hypot(c, d) || it.height || 12, bold: isBold(it.fontName) });
      }
      pages.push({ width: view.width, height: view.height, items });
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
  return { html: layoutToHtml(pages), pages: pages.length };
}
