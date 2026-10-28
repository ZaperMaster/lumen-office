import type { Evaluator, Scalar } from "@/lib/sheet/formula";
import { formatValue } from "@/lib/sheet/format";
import { colName, key, newSheet, uniqueSheetName, type Cell, type CellStyle, type Range, type Workbook } from "@/lib/sheet/model";

/*
 * Tablas dinámicas: agrupan los datos por una columna (y opcionalmente por otra
 * en columnas) y resumen una tercera. Se crean con fórmulas …SI.CONJUNTO, así
 * que los totales se actualizan solos si cambian los datos de origen.
 */

export type PivotFn = "SUMA" | "CONTAR" | "PROMEDIO" | "MAX" | "MIN";

export const PIVOT_FNS: { id: PivotFn; label: string }[] = [
  { id: "SUMA", label: "Suma" },
  { id: "CONTAR", label: "Recuento" },
  { id: "PROMEDIO", label: "Promedio" },
  { id: "MAX", label: "Máximo" },
  { id: "MIN", label: "Mínimo" },
];

export interface PivotSpec {
  sheet: number;
  /** Rango de origen con encabezados en la primera fila */
  range: Range;
  /** Columnas (índice absoluto en la hoja) */
  rows: number;
  cols: number | null;
  value: number;
  fn: PivotFn;
}

const quoteSheet = (name: string) => (/^[A-Za-z_À-ɏ][\w.À-ɏ]*$/.test(name) ? name : `'${name.replace(/'/g, "''")}'`);

/** Valores distintos (como se ven) de una columna, ordenados. */
function uniques(ev: Evaluator, si: number, col: number, r1: number, r2: number): { text: string; raw: Scalar }[] {
  const seen = new Map<string, Scalar>();
  for (let r = r1; r <= r2; r++) {
    const v = ev.value(si, r, col);
    if (v === null || v === "") continue;
    const t = formatValue(v);
    if (!seen.has(t)) seen.set(t, v);
  }
  return [...seen.entries()]
    .map(([text, raw]) => ({ text, raw }))
    .sort((a, b) =>
      typeof a.raw === "number" && typeof b.raw === "number" ? a.raw - b.raw : a.text.localeCompare(b.text, "es", { numeric: true, sensitivity: "base" }),
    );
}

const HEAD: CellStyle = { b: true, bg: "#dbe5f1", bb: true };
const TOTAL: CellStyle = { b: true, bt: true, bg: "#eef3f9" };

/** Crea la tabla dinámica en una hoja nueva y devuelve el libro con esa hoja activa. */
export function buildPivot(wb: Workbook, ev: Evaluator, p: PivotSpec): Workbook {
  const src = wb.sheets[p.sheet];
  const { range: rg } = p;
  const first = rg.r1 + 1;
  const last = rg.r2;
  const ref = (c: number) => `${quoteSheet(src.name)}!$${colName(c)}$${first + 1}:$${colName(c)}$${last + 1}`;
  const header = (c: number) => formatValue(ev.value(p.sheet, rg.r1, c)) || `Columna ${colName(c)}`;
  const rowItems = uniques(ev, p.sheet, p.rows, first, last);
  const colItems = p.cols !== null ? uniques(ev, p.sheet, p.cols, first, last) : [];
  const valueFmt = src.cells[key(first, p.value)]?.s;
  const numStyle: CellStyle = p.fn === "CONTAR" ? {} : { fmt: valueFmt?.fmt, dec: valueFmt?.dec };

  const s = newSheet(uniqueSheetName(wb, "Tabla dinámica "));
  const put = (r: number, c: number, cell: Cell) => (s.cells[key(r, c)] = cell);
  const fnLabel = PIVOT_FNS.find((f) => f.id === p.fn)!.label;
  // Fórmula del resumen con los criterios dados (referencias a celdas de la tabla)
  const formula = (crits: [number, string][]) => {
    const c = crits.map(([col, cell]) => `${ref(col)};${cell}`).join(";");
    switch (p.fn) {
      case "SUMA":
        return `=SUMAR.SI.CONJUNTO(${ref(p.value)};${c})`;
      case "CONTAR":
        return `=CONTAR.SI.CONJUNTO(${c})`;
      case "PROMEDIO":
        return `=SI.ERROR(PROMEDIO.SI.CONJUNTO(${ref(p.value)};${c});"")`;
      case "MAX":
        return `=MAX.SI.CONJUNTO(${ref(p.value)};${c})`;
      case "MIN":
        return `=MIN.SI.CONJUNTO(${ref(p.value)};${c})`;
    }
  };
  // Total sin criterios
  const grand = (crits: [number, string][]) =>
    crits.length
      ? formula(crits)
      : p.fn === "SUMA"
        ? `=SUMA(${ref(p.value)})`
        : p.fn === "CONTAR"
          ? `=CONTARA(${ref(p.rows)})`
          : p.fn === "PROMEDIO"
            ? `=PROMEDIO(${ref(p.value)})`
            : `=${p.fn}(${ref(p.value)})`;

  put(0, 0, { v: `${fnLabel} de ${header(p.value)}`, s: { b: true, fs: 13 } });
  const top = 2;
  put(top, 0, { v: header(p.rows), s: HEAD });
  // Encabezados de columnas
  const cols = colItems.length ? colItems : [null];
  cols.forEach((ci, j) => put(top, 1 + j, { v: ci ? String(ci.raw ?? ci.text) : fnLabel, s: { ...HEAD, align: "center", fmt: ci ? src.cells[key(first, p.cols!)]?.s?.fmt : undefined } }));
  const totalCol = colItems.length ? 1 + cols.length : null;
  if (totalCol !== null) put(top, totalCol, { v: "Total general", s: { ...HEAD, align: "center" } });

  const labelFmt = src.cells[key(first, p.rows)]?.s?.fmt;
  rowItems.forEach((ri, i) => {
    const r = top + 1 + i;
    put(r, 0, { v: typeof ri.raw === "number" ? String(ri.raw) : String(ri.raw ?? ""), s: labelFmt ? { fmt: labelFmt } : undefined });
    const rowCell = `$A${r + 1}`;
    cols.forEach((ci, j) => {
      const crits: [number, string][] = [[p.rows, rowCell]];
      if (ci) crits.push([p.cols!, `${colName(1 + j)}$${top + 1}`]);
      put(r, 1 + j, { v: formula(crits), s: numStyle });
    });
    if (totalCol !== null) put(r, totalCol, { v: formula([[p.rows, rowCell]]), s: { ...numStyle, b: true } });
  });
  const tr = top + 1 + rowItems.length;
  put(tr, 0, { v: "Total general", s: TOTAL });
  cols.forEach((ci, j) => put(tr, 1 + j, { v: grand(ci ? [[p.cols!, `${colName(1 + j)}$${top + 1}`]] : []), s: { ...TOTAL, ...numStyle } }));
  if (totalCol !== null) put(tr, totalCol, { v: grand([]), s: { ...TOTAL, ...numStyle } });

  s.colW = { 0: 180 };
  s.freezeR = top + 1;
  const sheets = [...wb.sheets, s];
  return { sheets, active: sheets.length - 1 };
}
