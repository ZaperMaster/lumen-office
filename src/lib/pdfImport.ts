/*
 * Abrir un PDF como documento editable.
 *
 * pdf.js (de Mozilla) da cada trozo de texto con su posición, tamaño y fuente;
 * con eso se rehace el documento: títulos (por el tamaño de letra), párrafos
 * (por la separación entre líneas), listas, tablas (por las columnas alineadas),
 * imágenes, negrita, cursiva y texto centrado. Los números de página y los
 * encabezados o pies que se repiten en todas las páginas se quitan.
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
  italic?: boolean;
  /** Letra de ancho fijo (código, comandos) */
  mono?: boolean;
}

/** Una imagen del PDF ya convertida en data URL; (x, y) es la esquina inferior izquierda */
export interface PdfImage {
  x: number;
  y: number;
  w: number;
  h: number;
  src: string;
}

/** Un rectángulo relleno del PDF (por ejemplo, el fondo de una celda); (x, y) es la esquina inferior izquierda */
export interface PdfRect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Color de relleno («#rrggbb») */
  fill: string;
}

export interface PdfPage {
  width: number;
  height: number;
  items: PdfText[];
  images?: PdfImage[];
  rects?: PdfRect[];
}

type Seg = { text: string; bold: boolean; italic: boolean; mono?: boolean };

interface Cell {
  x: number;
  xEnd: number;
  segs: Seg[];
}

interface Line {
  segs: Seg[];
  /** Trozos separados por huecos grandes (posibles celdas de una tabla) */
  cells: Cell[];
  x: number;
  xEnd: number;
  y: number;
  size: number;
  page: number;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const segsText = (segs: Seg[]) => segs.map((s) => s.text).join("");
const lineText = (l: Line) => segsText(l.segs);
// Incluye las viñetas de las fuentes de símbolos (Symbol, Wingdings, OpenSymbol), que usan U+F000–U+F0FF
const BULLET = /^\s*([•●▪◦‣∙·*–\--])\s*(?=\S)/;
const NUMBERED = /^\s*(\d{1,3}|[a-z])[.)]\s+/i;
const PAGE_NUMBER = /^\s*(p[áa]g(ina)?\.?\s*)?\d{1,4}(\s*(de|of|\/)\s*\d{1,4})?\s*$/i;

/** Añade un trozo a una lista de segmentos, uniendo los del mismo estilo */
function pushSeg(segs: Seg[], text: string, bold: boolean, italic: boolean, mono = false) {
  const prev = segs[segs.length - 1];
  if (prev && prev.bold === bold && prev.italic === italic && !!prev.mono === mono) prev.text += text;
  else segs.push({ text, bold, italic, mono });
}

/** Junta los trozos de texto de una página en líneas (y cada línea en posibles celdas). */
function pageLines(page: PdfPage, pageIndex: number): Line[] {
  // Los trozos que son solo espacios se ignoran: algunos programas (Chrome, Edge…) los usan para
  // rellenar el hueco entre celdas con un ancho enorme. Los espacios se recuperan por la distancia.
  const items = page.items.filter((it) => it.str.trim() !== "");
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
    const segs: Seg[] = [];
    const cells: Cell[] = [];
    let end = -Infinity;
    for (const it of l.items) {
      const gap = it.x - end;
      const italic = !!it.italic;
      // Hueco grande: empieza otra celda
      if (!cells.length || gap > Math.max(l.size * 1.1, 9)) cells.push({ x: it.x, xEnd: it.x + it.w, segs: [] });
      const cell = cells[cells.length - 1];
      let text = it.str;
      const prevText = segs.length ? segs[segs.length - 1].text : "";
      // Espacio entre trozos separados que no lo traen
      if (segs.length && gap > l.size * 0.18 && !/\s$/.test(prevText) && !/^\s/.test(text)) text = ` ${text}`;
      pushSeg(segs, text, it.bold, italic, !!it.mono);
      pushSeg(cell.segs, cell.segs.length ? text : it.str, it.bold, italic, !!it.mono);
      cell.xEnd = Math.max(cell.xEnd, it.x + it.w);
      end = Math.max(end, it.x + it.w);
    }
    return { segs, cells, x: l.items[0].x, xEnd: end, y: l.y, size: l.size, page: pageIndex };
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
  | { kind: "li"; ordered: boolean; html: string; last: Line; soft?: boolean }
  | { kind: "table"; rows: TableCell[][]; header: boolean }
  | { kind: "img"; src: string; width: number };

interface TableCell {
  html: string;
  /** Color de fondo («#rrggbb») */
  bg?: string;
  colspan?: number;
}

/** HTML de unos segmentos; los espacios de los extremos quedan fuera de la negrita y la cursiva */
const segsHtml = (segs: Seg[]) => {
  const out = segs
    .map((s) => {
      if ((!s.bold && !s.italic && !s.mono) || !s.text.trim()) return esc(s.text);
      const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(s.text)!;
      let inner = esc(core);
      if (s.mono) inner = `<code>${inner}</code>`;
      if (s.italic) inner = `<em>${inner}</em>`;
      if (s.bold) inner = `<strong>${inner}</strong>`;
      return `${lead}${inner}${trail}`;
    })
    .join("");
  return out
    .replace(/<\/strong>(\s*)<strong>/g, "$1")
    .replace(/<\/em>(\s*)<em>/g, "$1")
    .replace(/<\/code>(\s*)<code>/g, "$1");
};

/**
 * Intenta leer una tabla a partir de la línea `start`: varias líneas seguidas con
 * dos o más celdas cuyas columnas coinciden. Devuelve la tabla y cuántas líneas ocupa.
 */
function readTable(lines: Line[], start: number, body: number): { block: Extract<Block, { kind: "table" }>; used: number } | null {
  const first = lines[start];
  if (first.cells.length < 2) return null;
  const run: Line[] = [first];
  for (let j = start + 1; j < lines.length; j++) {
    const l = lines[j];
    const p = run[run.length - 1];
    if (l.page !== p.page || p.y - l.y > Math.max(p.size, l.size) * 3.2 || l.size / body >= 1.3) break;
    // Una línea de una sola celda solo sigue en la tabla si no empieza en la primera columna (texto partido en una celda)
    if (l.cells.length < 2 && l.x <= first.cells[0].x + body * 1.5) break;
    run.push(l);
  }
  const multi = run.filter((l) => l.cells.length >= 2);
  if (multi.length < 2) return null;

  // Columnas: las franjas horizontales que ocupa el texto, separadas por huecos en blanco
  // que atraviesan todas las filas (así valen las columnas alineadas a la derecha o centradas)
  const spans = run
    .flatMap((l) => l.cells.map((c) => [c.x, c.xEnd] as [number, number]))
    .sort((a, b) => a[0] - b[0]);
  const columns: [number, number][] = [];
  for (const [a, b] of spans) {
    const lastCol = columns[columns.length - 1];
    if (lastCol && a <= lastCol[1] + 2) lastCol[1] = Math.max(lastCol[1], b);
    else columns.push([a, b]);
  }
  if (columns.length < 2) return null;
  const col = (c: Cell) => {
    // La columna con la que más se solapa la celda
    let best = 0;
    let most = -Infinity;
    columns.forEach(([a, b], k) => {
      const overlap = Math.min(b, c.xEnd) - Math.max(a, c.x);
      if (overlap > most) {
        most = overlap;
        best = k;
      }
    });
    return best;
  };
  // Casi todas las celdas deben caer en columnas distintas de su fila
  let ok = 0;
  let total = 0;
  for (const l of multi) {
    ok += new Set(l.cells.map(col)).size;
    total += l.cells.length;
  }
  if (ok / total < 0.8) return null;

  const rows: { cells: Seg[][]; bold: boolean }[] = [];
  for (const l of run) {
    const cells: Seg[][] = columns.map(() => []);
    for (const c of l.cells) {
      const k = col(c);
      if (cells[k].length) pushSeg(cells[k], " ", false, false);
      for (const s of c.segs) pushSeg(cells[k], s.text, s.bold, s.italic, !!s.mono);
    }
    const startsRow = cells[0].length > 0;
    const prevRow = rows[rows.length - 1];
    if (!startsRow && prevRow) {
      // Texto que sigue en la línea de abajo dentro de las mismas celdas
      cells.forEach((segs, k) => {
        if (!segs.length) return;
        if (prevRow.cells[k].length) pushSeg(prevRow.cells[k], " ", false, false);
        for (const s of segs) pushSeg(prevRow.cells[k], s.text, s.bold, s.italic, !!s.mono);
      });
    } else {
      rows.push({ cells, bold: l.cells.every((c) => c.segs.every((s) => s.bold || !s.text.trim())) });
    }
  }
  const header = rows.length > 1 && rows[0].bold && !rows.slice(1).every((r) => r.bold);
  return {
    block: { kind: "table", header, rows: rows.map((r, i) => r.cells.map((segs) => ({ html: header && i === 0 ? esc(segsText(segs).trim()) : segsHtml(segs).trim() }))) },
    used: run.length,
  };
}

/** ¿Es oscuro un color? (para poner el texto en blanco encima) */
function isDark(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b < 140;
}

/**
 * Tablas dibujadas con rectángulos (cada celda es un rectángulo relleno, como hacen
 * Word y LibreOffice): se rehacen celda a celda, con sus colores. Devuelve las tablas
 * y los trozos de texto que han quedado dentro de ellas.
 */
function boxTables(page: PdfPage, pageIndex: number): { tables: { top: number; block: Extract<Block, { kind: "table" }> }[]; used: Set<PdfText> } {
  const used = new Set<PdfText>();
  const tables: { top: number; block: Extract<Block, { kind: "table" }> }[] = [];
  const all = (page.rects ?? []).filter((r) => r.w >= 12 && r.h >= 8 && !(r.w > page.width * 0.9 && r.h > page.height * 0.9));
  // Sin repetidos
  const rects = all.filter((r, i) => all.findIndex((o) => Math.abs(o.x - r.x) < 0.5 && Math.abs(o.y - r.y) < 0.5 && Math.abs(o.w - r.w) < 0.5 && Math.abs(o.h - r.h) < 0.5) === i);
  if (rects.length < 2) return { tables, used };

  // Grupos de rectángulos que se tocan: cada grupo es una tabla
  const parent = rects.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const touch = (a: PdfRect, b: PdfRect) => a.x <= b.x + b.w + 1.5 && b.x <= a.x + a.w + 1.5 && a.y <= b.y + b.h + 1.5 && b.y <= a.y + a.h + 1.5;
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) if (touch(rects[i], rects[j])) parent[find(i)] = find(j);
  const groups = new Map<number, PdfRect[]>();
  rects.forEach((r, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), r]));

  const inside = (r: PdfRect, x: number, y: number) => x >= r.x - 1 && x <= r.x + r.w + 1 && y >= r.y - 1 && y <= r.y + r.h + 1;
  for (const group of groups.values()) {
    // Solo las celdas: fuera los rectángulos que contienen a otros (fondos de toda la tabla)
    const cells = group.filter((r) => !group.some((o) => o !== r && o.x >= r.x - 0.5 && o.y >= r.y - 0.5 && o.x + o.w <= r.x + r.w + 0.5 && o.y + o.h <= r.y + r.h + 0.5 && (o.w < r.w - 1 || o.h < r.h - 1)));
    if (cells.length < 2) continue;
    const content = new Map<PdfRect, PdfText[]>();
    for (const it of page.items) {
      if (used.has(it) || !it.str.trim()) continue;
      const cx = it.x + it.w / 2;
      const cy = it.y + it.size * 0.35;
      const cell = cells.find((c) => inside(c, cx, cy));
      if (cell) content.set(cell, [...(content.get(cell) ?? []), it]);
    }
    // Una tabla de verdad tiene texto en al menos dos celdas
    if (content.size < 2) continue;
    for (const items of content.values()) for (const it of items) used.add(it);

    // Filas: celdas con el mismo borde superior; columnas: bordes izquierdos distintos
    const rows: PdfRect[][] = [];
    for (const c of [...cells].sort((a, b) => b.y + b.h - (a.y + a.h) || a.x - b.x)) {
      const row = rows.find((r) => Math.abs(r[0].y + r[0].h - (c.y + c.h)) < 2);
      if (row) row.push(c);
      else rows.push([c]);
    }
    const starts = [...new Set(cells.map((c) => Math.round(c.x)))].sort((a, b) => a - b).filter((x, i, xs) => i === 0 || x - xs[i - 1] > 2);
    const html = rows.map((row) =>
      row
        .sort((a, b) => a.x - b.x)
        .map((c): TableCell => {
          const lines = pageLines({ width: page.width, height: page.height, items: content.get(c) ?? [] }, pageIndex);
          let text = "";
          let prevLine: Line | null = null;
          for (const l of lines) {
            const part = segsHtml(l.segs).trim();
            if (!part) continue;
            // Una línea que no llega al final de la celda es un salto de línea a propósito (p. ej. una orden por línea)
            const brk = prevLine && prevLine.xEnd < c.x + c.w - l.size * 3;
            if (!text) text = part;
            else if (/[a-záéíóúñü]-$/i.test(text) && /^[a-záéíóúñü]/.test(part)) text = text.slice(0, -1) + part;
            else text = `${text}${brk ? "<br>" : " "}${part}`;
            prevLine = l;
          }
          const bg = c.fill.toLowerCase() !== "#ffffff" ? c.fill.toLowerCase() : undefined;
          const colspan = starts.filter((s) => s >= c.x - 2 && s < c.x + c.w - 2).length;
          return { html: bg && isDark(bg) && text ? `<span style="color:#ffffff">${text}</span>` : text, bg, colspan: colspan > 1 ? colspan : undefined };
        }),
    );
    const firstDark = rows[0].every((c) => c.fill.toLowerCase() !== "#ffffff" && isDark(c.fill));
    const firstBold = rows[0].every((c) => (content.get(c) ?? []).every((it) => it.bold));
    tables.push({ top: Math.max(...cells.map((c) => c.y + c.h)), block: { kind: "table", rows: html, header: rows.length > 1 && (firstDark || firstBold) } });
  }
  return { tables, used };
}

/** Convierte las páginas leídas en el HTML del documento. */
export function layoutToHtml(pages: PdfPage[]): string {
  // Primero las tablas dibujadas con rectángulos; su texto ya no se trata como líneas sueltas
  const boxed = pages.map((p, i) => boxTables(p, i));
  const all = pages.map((p, i) => pageLines({ ...p, items: p.items.filter((it) => !boxed[i].used.has(it)) }, i));
  const drop = chrome(pages, all);
  const lines = all.flat().filter((l) => !drop.has(l) && lineText(l).trim());
  // Lo que va «flotando» entre el texto según su altura en la página: imágenes y tablas
  const images: { page: number; top: number; block: Block }[] = [
    ...pages.flatMap((p, page) =>
      (p.images ?? []).map((img) => ({ page, top: img.y + img.h, block: { kind: "img", src: img.src, width: Math.min(640, Math.round(img.w * (96 / 72))) } as Block })),
    ),
    ...boxed.flatMap((b, page) => b.tables.map((t) => ({ page, top: t.top, block: t.block as Block }))),
  ];
  if (!lines.length && !images.length) return "";
  const body = lines.length ? bodySize(lines) : 12;
  // Niveles de título según el tamaño: el más grande es Título 1, el siguiente Título 2…
  const headingSizes = [...new Set(lines.filter((l) => l.size / body >= 1.15).map((l) => Math.round(l.size)))].sort((a, b) => b - a);
  const headingLevel = (size: number): 1 | 2 | 3 => Math.min(3, headingSizes.indexOf(Math.round(size)) + 1 || 3) as 1 | 2 | 3;
  // Margen izquierdo más habitual y dónde acaban las líneas llenas, por página
  const counts = new Map<number, number>();
  for (const l of lines) counts.set(Math.round(l.x), (counts.get(Math.round(l.x)) ?? 0) + 1);
  const margin = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
  const right = pages.map((_, i) => Math.max(0, ...lines.filter((l) => l.page === i).map((l) => l.xEnd)));
  const full = (l: Line) => l.xEnd > right[l.page] - l.size * 2.5;
  const blocks: Block[] = [];
  let prev: Line | null = null;
  // Imágenes y tablas se colocan antes de la primera línea que queda por debajo de ellas
  const pending = [...images].sort((a, b) => a.page - b.page || b.top - a.top);
  const flushImages = (before?: Line) => {
    while (pending.length && (!before || pending[0].page < before.page || (pending[0].page === before.page && pending[0].top > before.y))) {
      blocks.push(pending.shift()!.block);
      prev = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    flushImages(l);
    const text = lineText(l).replace(/\s+/g, " ").trim();
    const w = pages[l.page].width;
    const center = Math.abs((l.x + l.xEnd) / 2 - w / 2) < w * 0.05 && l.xEnd - l.x < w * 0.75 && l.x > w * 0.15;
    const ratio = l.size / body;
    const allBold = l.segs.every((s) => s.bold || !s.text.trim());
    const last = blocks[blocks.length - 1];
    const gap = prev && prev.page === l.page ? prev.y - l.y : Infinity;
    const close = gap <= Math.max(prev?.size ?? 0, l.size) * 1.75;

    // Tablas: líneas con varias celdas alineadas en columnas
    if (ratio < 1.3) {
      const table = readTable(lines, i, body);
      if (table) {
        blocks.push(table.block);
        i += table.used - 1;
        prev = lines[i];
        continue;
      }
    }

    // Títulos: letra más grande, o una línea corta en negrita separada del resto
    // (una etiqueta en negrita más pequeña que el texto normal no es un título)
    const isHeading = ratio >= 1.15 || (allBold && ratio >= 0.95 && text.length < 90 && !close && !/[.,;:]$/.test(text) && lines.length > 1);
    if (isHeading) {
      const level = ratio >= 1.15 ? headingLevel(l.size) : 3;
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
      // Quita la viñeta o el número del principio (se cuentan solo los caracteres visibles, sin los espacios)
      let cut = m[0].replace(/\s/g, "").length;
      while (cut > 0 && segs.length) {
        const s = segs[0].text.replace(/^\s+/, "");
        if (s.length <= cut) {
          cut -= s.length;
          segs.shift();
        } else {
          segs[0] = { ...segs[0], text: s.slice(cut).replace(/^\s+/, "") };
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
    // Las líneas para escribir («_____») van cada una en su párrafo
    const writingLine = (s: string) => /^[_.\s]{8,}$/.test(s);
    const continues =
      last?.kind === "p" &&
      !writingLine(text) &&
      !writingLine(last.plain) &&
      sameSize &&
      (close ||
        // Un párrafo que sigue en la página siguiente
        (prev!.page !== l.page && !/[.!?:»”")]$/.test(last.plain)));
    if (continues) {
      const p = last as Extract<Block, { kind: "p" }>;
      const html = segsHtml(l.segs).trim();
      // Palabra partida con guion al final de la línea
      if (/[a-záéíóúñü]-$/i.test(p.plain) && /^[a-záéíóúñü]/.test(text)) {
        p.html = p.html.replace(/-((<\/(strong|em)>)*)$/, "$1") + html;
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
  flushImages();

  // Un «título» de varias frases largas es en realidad un párrafo con la letra algo mayor
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.kind === "h" && b.text.length > 160) blocks[i] = { kind: "p", html: esc(b.text), plain: b.text, center: b.center, last: lines[0], joinPrev: false };
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
  const closeList = () => {
    if (list) html += `</${list}>`;
    list = null;
  };
  for (const b of blocks) {
    if (b.kind === "li") {
      const tag = b.ordered ? "ol" : "ul";
      if (list !== tag) {
        closeList();
        html += `<${tag}>`;
        list = tag;
      }
      html += `<li><p>${b.html}</p></li>`;
      continue;
    }
    closeList();
    if (b.kind === "table") {
      html += "<table><tbody>";
      b.rows.forEach((r, i) => {
        const tag = b.header && i === 0 ? "th" : "td";
        const cell = (c: TableCell) => {
          const span = c.colspan ? ` colspan="${c.colspan}"` : "";
          const bg = c.bg ? ` style="background-color:${c.bg}"` : "";
          return `<${tag}${span}${bg}><p>${c.html}</p></${tag}>`;
        };
        html += `<tr>${r.map(cell).join("")}</tr>`;
      });
      html += "</tbody></table>";
      continue;
    }
    if (b.kind === "img") {
      html += `<img src="${b.src}" width="${b.width}" data-align="center">`;
      continue;
    }
    const style = b.center ? ' style="text-align:center"' : "";
    if (b.kind === "h") html += `<h${b.level}${style}>${esc(b.text)}</h${b.level}>`;
    else html += `<p${style}>${b.html}</p>`;
  }
  closeList();
  return html;
}

type Matrix = [number, number, number, number, number, number];
const multiply = (m: Matrix, t: Matrix): Matrix => [
  t[0] * m[0] + t[1] * m[2],
  t[0] * m[1] + t[1] * m[3],
  t[2] * m[0] + t[3] * m[2],
  t[2] * m[1] + t[3] * m[3],
  t[4] * m[0] + t[5] * m[2] + m[4],
  t[4] * m[1] + t[5] * m[3] + m[5],
];

interface PdfImageObject {
  width: number;
  height: number;
  bitmap?: ImageBitmap;
  data?: Uint8ClampedArray;
  kind?: number;
}

/** Dibuja una imagen de pdf.js en un lienzo y la devuelve como data URL (o null si no se puede). */
function imageToDataUrl(img: PdfImageObject): string | null {
  const { width, height } = img;
  if (!width || !height) return null;
  // Sin pasar de 1600 px de ancho (suficiente para la página y no pesa demasiado)
  const scale = Math.min(1, 1600 / width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const g = canvas.getContext("2d");
  if (!g) return null;
  if (img.bitmap) {
    g.drawImage(img.bitmap, 0, 0, canvas.width, canvas.height);
  } else if (img.data) {
    // kind 2 = RGB (3 bytes por píxel), 3 = RGBA (4 bytes)
    const rgba = new Uint8ClampedArray(width * height * 4);
    if (img.kind === 3) rgba.set(img.data.subarray(0, rgba.length));
    else if (img.kind === 2) {
      for (let i = 0, j = 0; j < rgba.length; i += 3, j += 4) {
        rgba[j] = img.data[i];
        rgba[j + 1] = img.data[i + 1];
        rgba[j + 2] = img.data[i + 2];
        rgba[j + 3] = 255;
      }
    } else return null;
    const full = document.createElement("canvas");
    full.width = width;
    full.height = height;
    full.getContext("2d")!.putImageData(new ImageData(rgba, width, height), 0, 0);
    g.drawImage(full, 0, 0, canvas.width, canvas.height);
  } else return null;
  // Las fotos grandes en JPEG (pesan mucho menos); las pequeñas en PNG (nítidas y con transparencia)
  return canvas.width * canvas.height > 250_000 ? canvas.toDataURL("image/jpeg", 0.88) : canvas.toDataURL("image/png");
}

/** Lee un PDF y devuelve el HTML del documento. */
export async function readPdf(data: ArrayBuffer): Promise<{ html: string; pages: number }> {
  const pdfjs = await import("pdfjs-dist");
  const { default: workerUrl } = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  // Sin formularios XFA (que pueden traer código) y sin descargar nada externo
  // fontExtraProperties: para conocer el nombre real de cada fuente (y saber cuáles son negrita o cursiva)
  const task = pdfjs.getDocument({ data: new Uint8Array(data), enableXfa: false, fontExtraProperties: true });
  const doc = await task.promise;
  const pages: PdfPage[] = [];
  const OPS = pdfjs.OPS;
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const view = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      // Las fuentes y las imágenes se cargan con la lista de operaciones
      const ops = await page.getOperatorList().catch(() => null);
      // Nombre real de cada fuente (p. ej. «Calibri-Bold»)
      const names = new Map<string, string>();
      try {
        for (const [id, font] of page.commonObjs as unknown as Iterable<[string, { name?: string } | null]>) names.set(id, font?.name ?? "");
      } catch {
        // Sin información de fuentes: no se marca negrita ni cursiva
      }
      const fontOf = (fontName: string) => `${names.get(fontName) ?? ""} ${content.styles[fontName]?.fontFamily ?? ""}`;
      const items: PdfText[] = [];
      for (const it of content.items) {
        if (!("str" in it)) continue;
        const [, , c, d, x, y] = it.transform as number[];
        const font = fontOf(it.fontName);
        items.push({
          str: it.str,
          x,
          y,
          w: it.width,
          size: Math.hypot(c, d) || it.height || 12,
          bold: /bold|black|heavy|semibold|demi/i.test(font),
          italic: /italic|oblique/i.test(font),
          mono: /mono|courier|consolas|menlo|code|typewriter/i.test(font),
        });
      }

      // Imágenes: posición (según la matriz de transformación) y contenido
      const images: PdfImage[] = [];
      const rects: PdfRect[] = [];
      const FILLS = new Set([OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
      if (ops) {
        let ctm: Matrix = [1, 0, 0, 1, 0, 0];
        let fill = "#000000";
        const stack: { ctm: Matrix; fill: string }[] = [];
        for (let k = 0; k < ops.fnArray.length; k++) {
          const fn = ops.fnArray[k];
          const args = ops.argsArray[k];
          if (fn === OPS.save) stack.push({ ctm, fill });
          else if (fn === OPS.restore) ({ ctm, fill } = stack.pop() ?? { ctm, fill });
          else if (fn === OPS.transform) ctm = multiply(ctm, args as Matrix);
          else if (fn === OPS.setFillRGBColor && typeof args?.[0] === "string") fill = args[0];
          else if (fn === OPS.constructPath && FILLS.has(args?.[0]) && args?.[2]) {
            // Trazado relleno: se guarda su caja (los fondos de las celdas son rectángulos)
            const [x1, y1, x2, y2] = Array.from(args[2] as ArrayLike<number>);
            const pts = [
              [x1, y1],
              [x2, y1],
              [x1, y2],
              [x2, y2],
            ].map(([x, y]) => [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]]);
            const xs = pts.map((p) => p[0]);
            const ys = pts.map((p) => p[1]);
            const x = Math.min(...xs);
            const y = Math.min(...ys);
            rects.push({ x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y, fill });
          }
          else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject) {
            const w = Math.hypot(ctm[0], ctm[1]);
            const h = Math.hypot(ctm[2], ctm[3]);
            // Se ignoran los adornos diminutos y los fondos de página completa
            if (w < 24 || h < 24 || (w > view.width * 0.95 && h > view.height * 0.95)) continue;
            let obj: PdfImageObject | null = null;
            if (fn === OPS.paintInlineImageXObject) obj = args[0] as PdfImageObject;
            else {
              const id = args[0] as string;
              const store = id.startsWith("g_") ? page.commonObjs : page.objs;
              obj = await new Promise<PdfImageObject | null>((ok) => {
                const t = setTimeout(() => ok(null), 4000);
                try {
                  store.get(id, (o: unknown) => {
                    clearTimeout(t);
                    ok(o as PdfImageObject);
                  });
                } catch {
                  clearTimeout(t);
                  ok(null);
                }
              });
            }
            const src = obj ? imageToDataUrl(obj) : null;
            if (src) images.push({ x: ctm[4], y: Math.min(ctm[5], ctm[5] + ctm[3]), w, h, src });
          }
        }
      }
      pages.push({ width: view.width, height: view.height, items, images, rects });
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
  return { html: layoutToHtml(pages), pages: pages.length };
}
