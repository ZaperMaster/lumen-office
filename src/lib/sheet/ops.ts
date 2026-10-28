import { adjustForInsert, Evaluator, renameSheetRefs, shiftFormula, type Scalar } from "@/lib/sheet/formula";
import { parseInput } from "@/lib/sheet/format";
import {
  key, MAX_COLS, MAX_ROWS, newSheet, normRange, parseKey, uid, uniqueSheetName,
  type Cell, type CellStyle, type Merge, type Range, type Sheet, type Workbook,
} from "@/lib/sheet/model";

/*
 * Operaciones sobre el libro. Todas devuelven un libro nuevo (el anterior queda
 * intacto para poder deshacer).
 */

function editSheet(wb: Workbook, si: number, fn: (s: Sheet) => void): Workbook {
  const s: Sheet = { ...wb.sheets[si], cells: { ...wb.sheets[si].cells } };
  fn(s);
  const sheets = [...wb.sheets];
  sheets[si] = s;
  return { ...wb, sheets };
}

const emptyStyle = (s?: CellStyle) => !s || Object.values(s).every((v) => v === undefined || v === false);

function putCell(s: Sheet, r: number, c: number, cell: Cell | null) {
  const k = key(r, c);
  if (!cell || (cell.v === "" && emptyStyle(cell.s))) delete s.cells[k];
  else s.cells[k] = cell;
}

/** Escribe lo que el usuario ha tecleado en una celda (deduce números, fechas, %…). */
export function inputCell(wb: Workbook, si: number, r: number, c: number, raw: string): Workbook {
  return editSheet(wb, si, (s) => {
    const prev = s.cells[key(r, c)];
    const { v, fmt } = parseInput(raw, prev?.s);
    const st = fmt && (!prev?.s?.fmt || prev.s.fmt === "general") ? { ...prev?.s, fmt } : prev?.s;
    putCell(s, r, c, { v, s: st });
    if (r >= s.rows - 5) s.rows = Math.min(MAX_ROWS, s.rows + 100);
  });
}

/** Mismo texto en todas las celdas de un rango (Ctrl+Intro). */
export function inputRange(wb: Workbook, si: number, rg: Range, raw: string): Workbook {
  let out = wb;
  const { r1, c1, r2, c2 } = normRange(rg);
  for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) out = inputCell(out, si, r, c, shiftFormula(raw, r - r1, c - c1));
  return out;
}

export function styleRange(wb: Workbook, si: number, rg: Range, patch: Partial<CellStyle> | ((s: CellStyle) => CellStyle)): Workbook {
  const { r1, c1, r2, c2 } = normRange(rg);
  return editSheet(wb, si, (s) => {
    for (let r = r1; r <= r2; r++)
      for (let c = c1; c <= c2; c++) {
        const prev = s.cells[key(r, c)];
        const base = prev?.s ?? {};
        const next = typeof patch === "function" ? patch(base) : { ...base, ...patch };
        for (const k of Object.keys(next) as (keyof CellStyle)[]) if (next[k] === undefined) delete next[k];
        putCell(s, r, c, { v: prev?.v ?? "", s: emptyStyle(next) ? undefined : next });
      }
  });
}

/** Bordes de un rango: todos, contorno, solo abajo… */
export function borderRange(wb: Workbook, si: number, rg: Range, mode: "all" | "outer" | "bottom" | "top" | "none" | "thickBottom"): Workbook {
  const { r1, c1, r2, c2 } = normRange(rg);
  return editSheet(wb, si, (s) => {
        for (let r = r1; r <= r2; r++)
          for (let c = c1; c <= c2; c++) {
            const prev = s.cells[key(r, c)];
            const st: CellStyle = { ...prev?.s };
            if (mode === "none") {
              delete st.bt;
              delete st.br;
              delete st.bb;
              delete st.bl;
            } else if (mode === "all") {
              st.bt = st.br = st.bb = st.bl = true;
            } else if (mode === "outer") {
              if (r === r1) st.bt = true;
              if (r === r2) st.bb = true;
              if (c === c1) st.bl = true;
              if (c === c2) st.br = true;
            } else if ((mode === "bottom" || mode === "thickBottom") && r === r2) st.bb = true;
            else if (mode === "top" && r === r1) st.bt = true;
            putCell(s, r, c, { v: prev?.v ?? "", s: emptyStyle(st) ? undefined : st });
          }
      });
}

export function clearRange(wb: Workbook, si: number, rg: Range, what: "all" | "contents" | "formats"): Workbook {
  const { r1, c1, r2, c2 } = normRange(rg);
  return editSheet(wb, si, (s) => {
    for (let r = r1; r <= r2; r++)
      for (let c = c1; c <= c2; c++) {
        const prev = s.cells[key(r, c)];
        if (!prev) continue;
        if (what === "all") delete s.cells[key(r, c)];
        else if (what === "contents") putCell(s, r, c, { v: "", s: prev.s });
        else putCell(s, r, c, { v: prev.v });
      }
  });
}

/* ------------------------------------------------------------------ */
/*  Filas y columnas                                                   */
/* ------------------------------------------------------------------ */

function shiftMap(m: Record<number, number>, at: number, count: number): Record<number, number> {
  const out: Record<number, number> = {};
  for (const [k, v] of Object.entries(m)) {
    const i = Number(k);
    if (i < at) out[i] = v;
    else if (count > 0) out[i + count] = v;
    else if (i >= at - count) out[i + count] = v;
  }
  return out;
}

/** Inserta (count > 0) o elimina (count < 0) filas o columnas a partir de `at`. */
export function insertLines(wb: Workbook, si: number, axis: "row" | "col", at: number, count: number): Workbook {
  const target = wb.sheets[si];
  const sheets = wb.sheets.map((s, i) => {
    const cells: Record<string, Cell> = {};
    for (const [k, cell] of Object.entries(s.cells)) {
      let [r, c] = parseKey(k);
      const v = adjustForInsert(cell.v, target.name, i === si, axis, at, count);
      const nc = v === cell.v ? cell : { ...cell, v };
      if (i === si) {
        const p = axis === "row" ? r : c;
        if (p >= at) {
          if (count < 0 && p < at - count) continue; // eliminada
          if (axis === "row") r += count;
          else c += count;
        }
      }
      cells[key(r, c)] = nc;
    }
    if (i !== si) return { ...s, cells };
    const merges = (s.merges ?? [])
      .map((m): Merge | null => {
        const [a, b] = axis === "row" ? [m.r1, m.r2] : [m.c1, m.c2];
        let na = a;
        let nb = b;
        if (count > 0) {
          if (a >= at) na += count;
          if (b >= at) nb += count;
        } else {
          const end = at - count - 1;
          if (a >= at && b <= end) return null;
          na = a > end ? a + count : a >= at ? at : a;
          nb = b > end ? b + count : b >= at ? at - 1 : b;
          if (nb < na) return null;
        }
        return axis === "row" ? { ...m, r1: na, r2: nb } : { ...m, c1: na, c2: nb };
      })
      .filter((m): m is Merge => !!m && (m.r2 > m.r1 || m.c2 > m.c1));
    return {
      ...s,
      cells,
      merges,
      rowH: axis === "row" ? shiftMap(s.rowH, at, count) : s.rowH,
      colW: axis === "col" ? shiftMap(s.colW, at, count) : s.colW,
      rows: axis === "row" ? Math.min(MAX_ROWS, Math.max(50, s.rows + count)) : s.rows,
      cols: axis === "col" ? Math.min(MAX_COLS, Math.max(5, s.cols + count)) : s.cols,
    };
  });
  return { ...wb, sheets };
}

export function setSize(wb: Workbook, si: number, axis: "row" | "col", indexes: number[], size: number | null): Workbook {
  return editSheet(wb, si, (s) => {
    const m = { ...(axis === "row" ? s.rowH : s.colW) };
    for (const i of indexes) {
      if (size === null) delete m[i];
      else m[i] = Math.max(axis === "row" ? 12 : 20, Math.round(size));
    }
    if (axis === "row") s.rowH = m;
    else s.colW = m;
  });
}

/* ------------------------------------------------------------------ */
/*  Combinar, ordenar, rellenar                                        */
/* ------------------------------------------------------------------ */

export function toggleMerge(wb: Workbook, si: number, rg: Range): Workbook {
  const n = normRange(rg);
  return editSheet(wb, si, (s) => {
    const overlapping = (s.merges ?? []).filter((m) => !(m.r2 < n.r1 || m.r1 > n.r2 || m.c2 < n.c1 || m.c1 > n.c2));
    if (overlapping.length) {
      s.merges = (s.merges ?? []).filter((m) => !overlapping.includes(m));
      return;
    }
    if (n.r1 === n.r2 && n.c1 === n.c2) return;
    // Como en Excel: se queda el valor de la esquina superior izquierda
    for (let r = n.r1; r <= n.r2; r++)
      for (let c = n.c1; c <= n.c2; c++) if (r !== n.r1 || c !== n.c1) delete s.cells[key(r, c)];
    const first = s.cells[key(n.r1, n.c1)];
    s.cells[key(n.r1, n.c1)] = { v: first?.v ?? "", s: { ...first?.s, align: first?.s?.align ?? "center", valign: first?.s?.valign ?? "middle" } };
    s.merges = [...(s.merges ?? []), n];
  });
}

export function sortRange(wb: Workbook, si: number, rg: Range, byCol: number, asc: boolean, header: boolean): Workbook {
  const n = normRange(rg);
  const ev = new Evaluator(wb);
  const start = header ? n.r1 + 1 : n.r1;
  const rows: { cells: (Cell | undefined)[]; key: Scalar; from: number }[] = [];
  const s0 = wb.sheets[si];
  for (let r = start; r <= n.r2; r++) {
    const cells: (Cell | undefined)[] = [];
    for (let c = n.c1; c <= n.c2; c++) cells.push(s0.cells[key(r, c)]);
    rows.push({ cells, key: ev.value(si, r, byCol), from: r });
  }
  const cmp = (a: Scalar, b: Scalar) => {
    // Las celdas vacías van siempre al final
    if (a === null || a === "") return b === null || b === "" ? 0 : 1;
    if (b === null || b === "") return -1;
    if (typeof a === "number" && typeof b === "number") return asc ? a - b : b - a;
    if (typeof a === "number") return -1;
    if (typeof b === "number") return 1;
    const r = String(a).localeCompare(String(b), "es", { numeric: true, sensitivity: "base" });
    return asc ? r : -r;
  };
  rows.sort((a, b) => cmp(a.key, b.key));
  return editSheet(wb, si, (s) => {
    rows.forEach((row, i) => {
      const r = start + i;
      row.cells.forEach((cell, j) => {
        const c = n.c1 + j;
        putCell(s, r, c, cell ? { ...cell, v: shiftFormula(cell.v, r - row.from, 0) } : null);
      });
    });
  });
}

/**
 * Controlador de relleno: copia el origen hasta el destino. Si el origen son
 * números en progresión (1, 2, 3… o fechas), continúa la serie.
 */
export function fillRange(wb: Workbook, si: number, src: Range, dest: Range): Workbook {
  const s0 = wb.sheets[si];
  const S = normRange(src);
  const D = normRange(dest);
  const vertical = D.c1 === S.c1 && D.c2 === S.c2;
  return editSheet(wb, si, (s) => {
    const lines = vertical ? S.c2 - S.c1 + 1 : S.r2 - S.r1 + 1;
    for (let l = 0; l < lines; l++) {
      const srcCells: { cell: Cell | undefined; r: number; c: number }[] = [];
      const len = vertical ? S.r2 - S.r1 + 1 : S.c2 - S.c1 + 1;
      for (let i = 0; i < len; i++) {
        const r = vertical ? S.r1 + i : S.r1 + l;
        const c = vertical ? S.c1 + l : S.c1 + i;
        srcCells.push({ cell: s0.cells[key(r, c)], r, c });
      }
      const numsOnly = srcCells.every((x) => x.cell && !x.cell.v.startsWith("=") && x.cell.v !== "" && Number.isFinite(Number(x.cell.v)));
      let step = 0;
      if (numsOnly) {
        const vals = srcCells.map((x) => Number(x.cell!.v));
        step = vals.length > 1 ? (vals[vals.length - 1] - vals[0]) / (vals.length - 1) : srcCells[0].cell?.s?.fmt === "date" ? 1 : 0;
      }
      // Texto que termina en número (Semana 1, Semana 2…)
      const textNum = srcCells.length === 1 && /^(.*?)(\d+)$/.exec(srcCells[0].cell?.v ?? "");
      const [from, to] = vertical ? [D.r1, D.r2] : [D.c1, D.c2];
      for (let p = from; p <= to; p++) {
        const inSrc = vertical ? p >= S.r1 && p <= S.r2 : p >= S.c1 && p <= S.c2;
        if (inSrc) continue;
        // Distancia al principio del origen (negativa si se rellena hacia arriba o a la izquierda)
        const offset = p - (vertical ? S.r1 : S.c1);
        const base = srcCells[((offset % len) + len) % len];
        const r = vertical ? p : S.r1 + l;
        const c = vertical ? S.c1 + l : p;
        let v = base.cell?.v ?? "";
        if (numsOnly && step !== 0) {
          const first = Number(srcCells[0].cell!.v);
          v = String(Number((first + step * offset).toPrecision(15)));
        } else if (textNum && !textNum[1].startsWith("=") && !Number.isFinite(Number(v))) {
          const n = Number(textNum[2]) + offset;
          v = n >= 0 ? textNum[1] + String(n).padStart(textNum[2].length, "0") : v;
        } else v = shiftFormula(v, r - base.r, c - base.c);
        putCell(s, r, c, base.cell ? { v, s: base.cell.s } : null);
      }
    }
  });
}

/* ------------------------------------------------------------------ */
/*  Copiar y pegar                                                     */
/* ------------------------------------------------------------------ */

export interface ClipData {
  rows: number;
  cols: number;
  /** Celdas relativas a la esquina (fila, columna) */
  cells: (Cell | undefined)[][];
  /** Origen, para desplazar fórmulas y para cortar */
  r: number;
  c: number;
  sheet: number;
  cut: boolean;
  text: string;
}

export function copyRange(wb: Workbook, si: number, rg: Range, cut: boolean, text: string): ClipData {
  const n = normRange(rg);
  const s = wb.sheets[si];
  const cells: (Cell | undefined)[][] = [];
  for (let r = n.r1; r <= n.r2; r++) {
    const row: (Cell | undefined)[] = [];
    for (let c = n.c1; c <= n.c2; c++) row.push(s.cells[key(r, c)]);
    cells.push(row);
  }
  return { rows: n.r2 - n.r1 + 1, cols: n.c2 - n.c1 + 1, cells, r: n.r1, c: n.c1, sheet: si, cut, text };
}

export function pasteClip(wb: Workbook, si: number, r0: number, c0: number, clip: ClipData, mode: "all" | "values" | "formats" = "all"): Workbook {
  let out = wb;
  const ev = mode === "values" ? new Evaluator(wb) : null;
  if (clip.cut) out = clearRange(out, clip.sheet, { r1: clip.r, c1: clip.c, r2: clip.r + clip.rows - 1, c2: clip.c + clip.cols - 1 }, "all");
  return editSheet(out, si, (s) => {
    for (let i = 0; i < clip.rows; i++)
      for (let j = 0; j < clip.cols; j++) {
        const cell = clip.cells[i][j];
        const r = r0 + i;
        const c = c0 + j;
        if (r >= MAX_ROWS || c >= MAX_COLS) continue;
        const prev = s.cells[key(r, c)];
        if (mode === "formats") {
          putCell(s, r, c, { v: prev?.v ?? "", s: cell?.s });
          continue;
        }
        if (mode === "values") {
          const v = ev!.value(clip.sheet, clip.r + i, clip.c + j);
          putCell(s, r, c, { v: v === null ? "" : typeof v === "boolean" ? (v ? "TRUE" : "FALSE") : String(v), s: cell?.s ?? prev?.s });
          continue;
        }
        if (!cell) {
          putCell(s, r, c, null);
          continue;
        }
        // Al cortar, la fórmula se mueve tal cual; al copiar, se desplaza
        putCell(s, r, c, { v: clip.cut ? cell.v : shiftFormula(cell.v, r - (clip.r + i), c - (clip.c + j)), s: cell.s });
      }
    s.rows = Math.max(s.rows, Math.min(MAX_ROWS, r0 + clip.rows + 20));
    s.cols = Math.max(s.cols, Math.min(MAX_COLS, c0 + clip.cols + 2));
  });
}

/** Texto copiado desde otro programa (separado por tabuladores). */
export function pasteText(wb: Workbook, si: number, r0: number, c0: number, text: string): Workbook {
  const lines = text.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
  let out = wb;
  lines.forEach((line, i) => line.split("\t").forEach((raw, j) => (out = inputCell(out, si, r0 + i, c0 + j, raw))));
  return out;
}

export function rangeToText(wb: Workbook, si: number, rg: Range, display: (r: number, c: number) => string): string {
  const n = normRange(rg);
  const lines: string[] = [];
  for (let r = n.r1; r <= n.r2; r++) {
    const row: string[] = [];
    for (let c = n.c1; c <= n.c2; c++) row.push(display(r, c));
    lines.push(row.join("\t"));
  }
  void wb;
  void si;
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/*  Hojas                                                              */
/* ------------------------------------------------------------------ */

export function addSheet(wb: Workbook, after = wb.active): Workbook {
  const sheets = [...wb.sheets];
  sheets.splice(after + 1, 0, newSheet(uniqueSheetName(wb)));
  return { sheets, active: after + 1 };
}

export function duplicateSheet(wb: Workbook, si: number): Workbook {
  const src = wb.sheets[si];
  let name = `${src.name} (2)`;
  for (let i = 3; wb.sheets.some((s) => s.name.toLowerCase() === name.toLowerCase()); i++) name = `${src.name} (${i})`;
  const copy: Sheet = { ...structuredClone(src), id: uid(), name, charts: (src.charts ?? []).map((c) => ({ ...c, id: uid() })) };
  const sheets = [...wb.sheets];
  sheets.splice(si + 1, 0, copy);
  return { sheets, active: si + 1 };
}

export function deleteSheet(wb: Workbook, si: number): Workbook {
  if (wb.sheets.length <= 1) return wb;
  const sheets = wb.sheets.filter((_, i) => i !== si);
  return { sheets, active: Math.min(si, sheets.length - 1) };
}

export function renameSheet(wb: Workbook, si: number, name: string): Workbook {
  const clean = name.replace(/[\\/?*[\]:]/g, "").trim().slice(0, 31);
  const old = wb.sheets[si].name;
  if (!clean || clean === old || wb.sheets.some((s, i) => i !== si && s.name.toLowerCase() === clean.toLowerCase())) return wb;
  const sheets = wb.sheets.map((s, i) => {
    const cells: Record<string, Cell> = {};
    for (const [k, cell] of Object.entries(s.cells)) cells[k] = cell.v.startsWith("=") ? { ...cell, v: renameSheetRefs(cell.v, old, clean) } : cell;
    return { ...s, cells, name: i === si ? clean : s.name };
  });
  return { ...wb, sheets };
}

export function moveSheet(wb: Workbook, from: number, to: number): Workbook {
  if (to < 0 || to >= wb.sheets.length || from === to) return wb;
  const sheets = [...wb.sheets];
  const [s] = sheets.splice(from, 1);
  sheets.splice(to, 0, s);
  return { sheets, active: to };
}

export function updateSheet(wb: Workbook, si: number, patch: Partial<Sheet>): Workbook {
  return editSheet(wb, si, (s) => Object.assign(s, patch));
}

/* ------------------------------------------------------------------ */
/*  Tablas, filtros y formato condicional                              */
/* ------------------------------------------------------------------ */

export const TABLE_STYLES: { id: string; label: string; head: string; band: string; text: string }[] = [
  { id: "blue", label: "Azul", head: "#4472c4", band: "#d9e1f2", text: "#ffffff" },
  { id: "green", label: "Verde", head: "#0f9d58", band: "#e2efda", text: "#ffffff" },
  { id: "orange", label: "Naranja", head: "#ed7d31", band: "#fce4d6", text: "#ffffff" },
  { id: "gray", label: "Gris", head: "#595959", band: "#ededed", text: "#ffffff" },
  { id: "purple", label: "Morado", head: "#7030a0", band: "#e4dfec", text: "#ffffff" },
];

/** Encabezado en negrita y color, filas alternas, bordes y filtro. */
export function formatAsTable(wb: Workbook, si: number, rg: Range, styleId: string): Workbook {
  const t = TABLE_STYLES.find((x) => x.id === styleId) ?? TABLE_STYLES[0];
  const n = normRange(rg);
  return editSheet(wb, si, (s) => {
    for (let r = n.r1; r <= n.r2; r++)
      for (let c = n.c1; c <= n.c2; c++) {
        const prev = s.cells[key(r, c)];
        const head = r === n.r1;
        const st: CellStyle = {
          ...prev?.s,
          bg: head ? t.head : (r - n.r1) % 2 === 0 ? t.band : undefined,
          color: head ? t.text : prev?.s?.color,
          b: head ? true : prev?.s?.b,
          bb: true,
          bt: head ? true : prev?.s?.bt,
        };
        if (!st.bg) delete st.bg;
        putCell(s, r, c, { v: prev?.v ?? "", s: st });
      }
    s.filter = { ...n, show: {} };
  });
}

/** Oculta o muestra filas o columnas a mano. */
export function setHidden(wb: Workbook, si: number, axis: "row" | "col", indexes: number[], hide: boolean): Workbook {
  return editSheet(wb, si, (s) => {
    const k = axis === "row" ? "hiddenRows" : "hiddenCols";
    const set = new Set(s[k] ?? []);
    for (const i of indexes) {
      if (hide) set.add(i);
      else set.delete(i);
    }
    s[k] = [...set].sort((a, b) => a - b);
  });
}
