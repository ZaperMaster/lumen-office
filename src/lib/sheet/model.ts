/*
 * Modelo de las hojas de cálculo.
 *
 * Cada celda guarda lo que el usuario escribió (`v`): un número, un texto o una
 * fórmula que empieza por «=». Los valores calculados no se guardan: se obtienen
 * con el motor de fórmulas cada vez que cambia el libro.
 */

export type NumFmt = "general" | "number" | "currency" | "percent" | "date" | "time" | "datetime" | "text" | "thousands" | "scientific";

export interface CellStyle {
  b?: boolean;
  i?: boolean;
  u?: boolean;
  s?: boolean;
  color?: string;
  bg?: string;
  align?: "left" | "center" | "right";
  valign?: "top" | "middle" | "bottom";
  fmt?: NumFmt;
  /** Decimales para los formatos numéricos */
  dec?: number;
  fs?: number;
  font?: string;
  wrap?: boolean;
  /** Bordes: arriba, derecha, abajo, izquierda */
  bt?: boolean;
  br?: boolean;
  bb?: boolean;
  bl?: boolean;
}

export interface Cell {
  v: string;
  s?: CellStyle;
}

export type ChartType = "column" | "bar" | "line" | "area" | "pie" | "doughnut" | "scatter";

export interface ChartSpec {
  id: string;
  type: ChartType;
  /** Rango de datos en notación A1 (de la misma hoja) */
  range: string;
  title: string;
  /** Rango opcional con los nombres de las categorías (si no van en la primera columna) */
  labels?: string;
  /** Posición y tamaño en píxeles sobre la cuadrícula */
  x: number;
  y: number;
  w: number;
  h: number;
  legend?: boolean;
}

export interface Merge {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
}

export interface Sheet {
  id: string;
  name: string;
  /** Celdas con contenido o formato, por clave «fila,columna» (base 0) */
  cells: Record<string, Cell>;
  colW: Record<number, number>;
  rowH: Record<number, number>;
  rows: number;
  cols: number;
  /** Filas y columnas inmovilizadas */
  freezeR?: number;
  freezeC?: number;
  merges?: Merge[];
  charts?: ChartSpec[];
  showGrid?: boolean;
  tab?: string | null;
  /** Autofiltro: la primera fila del rango son los encabezados */
  filter?: SheetFilter | null;
  /** Reglas de formato condicional */
  cond?: CondRule[];
  /** Filas y columnas ocultas a mano */
  hiddenRows?: number[];
  hiddenCols?: number[];
}

export interface SheetFilter {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
  /** Por columna, los valores (como se ven) que se muestran; sin entrada = todos */
  show: Record<number, string[]>;
}

export type CondType =
  | "gt" | "lt" | "between" | "eq" | "text" | "dup" | "unique" | "top" | "bottom" | "aboveAvg" | "belowAvg" | "bars" | "scale";

export interface CondRule {
  id: string;
  range: string;
  type: CondType;
  /** Valores de la regla (número, texto o cantidad para «los 10 mejores») */
  a?: string;
  b?: string;
  /** Formato al cumplirse */
  bg?: string;
  color?: string;
  bold?: boolean;
  /** Colores de las escalas (2 o 3) y de las barras */
  colors?: string[];
}

export interface Workbook {
  sheets: Sheet[];
  active: number;
}

export const DEFAULT_COL_W = 96;
export const DEFAULT_ROW_H = 24;
export const MAX_ROWS = 20000;
export const MAX_COLS = 702; // hasta ZZ

export const key = (r: number, c: number) => `${r},${c}`;

export function parseKey(k: string): [number, number] {
  const i = k.indexOf(",");
  return [Number(k.slice(0, i)), Number(k.slice(i + 1))];
}

export function colName(c: number): string {
  let s = "";
  let n = c + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function colIndex(name: string): number {
  let n = 0;
  for (const ch of name.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export const addr = (r: number, c: number) => `${colName(c)}${r + 1}`;

/** «B3» → [2, 1]. Admite «$». */
export function parseAddr(a: string): [number, number] | null {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d{1,6})$/.exec(a.trim());
  if (!m) return null;
  return [Number(m[2]) - 1, colIndex(m[1])];
}

export interface Range {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
}

export function normRange(r: Range): Range {
  return { r1: Math.min(r.r1, r.r2), c1: Math.min(r.c1, r.c2), r2: Math.max(r.r1, r.r2), c2: Math.max(r.c1, r.c2) };
}

export function rangeToA1(r: Range): string {
  const n = normRange(r);
  return n.r1 === n.r2 && n.c1 === n.c2 ? addr(n.r1, n.c1) : `${addr(n.r1, n.c1)}:${addr(n.r2, n.c2)}`;
}

export function parseRange(s: string): Range | null {
  const [a, b] = s.split(":");
  const p = parseAddr(a);
  if (!p) return null;
  const q = b ? parseAddr(b) : p;
  if (!q) return null;
  return normRange({ r1: p[0], c1: p[1], r2: q[0], c2: q[1] });
}

let idSeq = 0;
export const uid = () => `${Date.now().toString(36)}${(idSeq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function newSheet(name: string): Sheet {
  return { id: uid(), name, cells: {}, colW: {}, rowH: {}, rows: 200, cols: 26, showGrid: true, charts: [], merges: [] };
}

export function newWorkbook(): Workbook {
  return { sheets: [newSheet("Hoja1")], active: 0 };
}

export function uniqueSheetName(wb: Workbook, base = "Hoja"): string {
  for (let i = wb.sheets.length + 1; ; i++) {
    const name = `${base}${i}`;
    if (!wb.sheets.some((s) => s.name.toLowerCase() === name.toLowerCase())) return name;
  }
}

export const colWidth = (s: Sheet, c: number) => s.colW[c] ?? DEFAULT_COL_W;
export const rowHeight = (s: Sheet, r: number) => s.rowH[r] ?? DEFAULT_ROW_H;

/** Rango ocupado (para imprimir, exportar y buscar). */
export function usedRange(s: Sheet): Range | null {
  let r2 = -1;
  let c2 = -1;
  for (const k in s.cells) {
    const cell = s.cells[k];
    if (!cell.v && !cell.s?.bg && !cell.s?.bt && !cell.s?.bb) continue;
    const [r, c] = parseKey(k);
    if (r > r2) r2 = r;
    if (c > c2) c2 = c;
  }
  return r2 < 0 ? null : { r1: 0, c1: 0, r2, c2 };
}

export function mergeAt(s: Sheet, r: number, c: number): Merge | undefined {
  return s.merges?.find((m) => r >= m.r1 && r <= m.r2 && c >= m.c1 && c <= m.c2);
}

/** Texto plano del libro (para la búsqueda y la vista previa en el inicio). */
export function workbookText(wb: Workbook, max = 4000): string {
  const out: string[] = [];
  let len = 0;
  for (const s of wb.sheets) {
    const keys = Object.keys(s.cells)
      .filter((k) => s.cells[k].v && !s.cells[k].v.startsWith("="))
      .sort((a, b) => {
        const [ra, ca] = parseKey(a);
        const [rb, cb] = parseKey(b);
        return ra - rb || ca - cb;
      });
    for (const k of keys) {
      out.push(s.cells[k].v);
      len += s.cells[k].v.length + 1;
      if (len > max) return out.join(" ");
    }
  }
  return out.join(" ");
}
