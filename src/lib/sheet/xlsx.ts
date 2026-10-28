import ExcelJS from "exceljs";
import { Evaluator, FErr, dateToSerial, toExcelFormula, type Scalar } from "@/lib/sheet/formula";
import { formatValue, parseInput } from "@/lib/sheet/format";
import { DEFAULT_COL_W, DEFAULT_ROW_H, key, newSheet, parseKey, parseRange, rangeToA1, usedRange, type Cell, type CellStyle, type CondRule, type Sheet, type Workbook } from "@/lib/sheet/model";
import { condFormatter, filterRange, hiddenRows } from "@/lib/sheet/view";

/*
 * Libros de Excel (.xlsx) y CSV. Este módulo se carga solo al abrir o guardar.
 */

/* ------------------------------------------------------------------ */
/*  Exportar                                                           */
/* ------------------------------------------------------------------ */

const argb = (hex: string) => "FF" + hex.replace("#", "").toUpperCase().padEnd(6, "0").slice(0, 6);

function excelNumFmt(s: CellStyle): string | undefined {
  const d = s.dec ?? 2;
  const zeros = d > 0 ? "." + "0".repeat(d) : "";
  switch (s.fmt) {
    case "number":
      return `0${zeros}`;
    case "thousands":
      return `#,##0${zeros}`;
    case "currency":
      return `#,##0${zeros} "€"`;
    case "percent":
      return `0${zeros}%`;
    case "date":
      return "dd/mm/yyyy";
    case "time":
      return "hh:mm";
    case "datetime":
      return "dd/mm/yyyy hh:mm";
    case "scientific":
      return `0${zeros}E+00`;
    case "text":
      return "@";
    default:
      return s.dec !== undefined ? `0${zeros}` : undefined;
  }
}

/** Regla de formato condicional en el formato de Excel. */
function excelRule(r: CondRule, priority: number): ExcelJS.ConditionalFormattingRule | null {
  const style = { fill: r.bg ? { type: "pattern" as const, pattern: "solid" as const, bgColor: { argb: argb(r.bg) } } : undefined, font: r.color ? { color: { argb: argb(r.color) } } : undefined };
  const num = (v?: string) => (v ?? "").replace(/\./g, "").replace(",", ".");
  const rg = parseRange(r.range);
  const first = rg ? rangeToA1({ r1: rg.r1, c1: rg.c1, r2: rg.r1, c2: rg.c1 }) : "A1";
  const abs = rg ? rangeToA1(rg).replace(/([A-Z]+)(\d+)/g, "$$$1$$$2") : "A1";
  let out: unknown = null;
  switch (r.type) {
    case "gt":
    case "lt":
    case "eq":
      out = { type: "cellIs", operator: r.type === "gt" ? "greaterThan" : r.type === "lt" ? "lessThan" : "equal", formulae: [/^-?[\d.,]+$/.test(r.a ?? "") ? num(r.a) : `"${r.a}"`], style };
      break;
    case "between":
      out = { type: "cellIs", operator: "between", formulae: [num(r.a), num(r.b)], style };
      break;
    case "text":
      out = { type: "containsText", operator: "containsText", text: r.a ?? "", style };
      break;
    case "dup":
    case "unique":
      out = { type: "expression", formulae: [`COUNTIF(${abs},${first})${r.type === "dup" ? ">1" : "=1"}`], style };
      break;
    case "top":
    case "bottom":
      out = { type: "top10", rank: Number(r.a) || 10, bottom: r.type === "bottom", style };
      break;
    case "aboveAvg":
    case "belowAvg":
      out = { type: "aboveAverage", aboveAverage: r.type === "aboveAvg", style };
      break;
    case "scale": {
      const cols = r.colors ?? [];
      out = {
        type: "colorScale",
        cfvo: cols.length === 3 ? [{ type: "min" }, { type: "percentile", value: 50 }, { type: "max" }] : [{ type: "min" }, { type: "max" }],
        color: cols.map((c) => ({ argb: argb(c) })),
      };
      break;
    }
    case "bars":
      out = { type: "dataBar", cfvo: [{ type: "min" }, { type: "max" }], color: { argb: argb(r.colors?.[0] ?? "#638ec6") }, gradient: true };
      break;
  }
  return out ? ({ ...(out as object), priority } as ExcelJS.ConditionalFormattingRule) : null;
}

interface ExcelCfRule {
  type: string;
  operator?: string;
  formulae?: (string | number)[];
  text?: string;
  rank?: number;
  bottom?: boolean;
  aboveAverage?: boolean;
  priority?: number;
  color?: { argb?: string } | { argb?: string }[];
  style?: { fill?: { bgColor?: { argb?: string }; fgColor?: { argb?: string } }; font?: { color?: { argb?: string }; bold?: boolean } };
}

const hexOf = (c?: { argb?: string }) => (c?.argb && c.argb.length >= 6 ? "#" + c.argb.slice(-6).toLowerCase() : undefined);

/** Regla de Excel en el formato de Lumen (las que no se entienden se ignoran). */
function ruleFromExcel(ref: string, x: ExcelCfRule): CondRule | null {
  // Varios rangos separados por espacios: se toma el primero
  const range = ref.split(/\s+/)[0];
  if (!parseRange(range)) return null;
  const base = {
    id: Math.random().toString(36).slice(2, 10),
    range,
    bg: hexOf(x.style?.fill?.bgColor) ?? hexOf(x.style?.fill?.fgColor),
    color: hexOf(x.style?.font?.color),
    bold: x.style?.font?.bold || undefined,
  };
  const f = (i: number) => {
    const v = x.formulae?.[i];
    return v === undefined ? undefined : String(v).replace(/^"|"$/g, "");
  };
  switch (x.type) {
    case "cellIs": {
      const op: Record<string, CondRule["type"]> = { greaterThan: "gt", lessThan: "lt", between: "between", equal: "eq" };
      const type = op[x.operator ?? ""];
      return type ? { ...base, type, a: f(0), b: f(1) } : null;
    }
    case "containsText":
      return { ...base, type: "text", a: x.text ?? "" };
    case "top10":
      return { ...base, type: x.bottom ? "bottom" : "top", a: String(x.rank ?? 10) };
    case "aboveAverage":
      return { ...base, type: x.aboveAverage === false ? "belowAvg" : "aboveAvg" };
    case "duplicateValues":
      return { ...base, type: "dup" };
    case "uniqueValues":
      return { ...base, type: "unique" };
    case "expression": {
      // La forma en que Lumen guarda «duplicados» y «únicos»
      const e = f(0) ?? "";
      if (/^COUNTIF\(.*\)>1$/i.test(e)) return { ...base, type: "dup" };
      if (/^COUNTIF\(.*\)=1$/i.test(e)) return { ...base, type: "unique" };
      return null;
    }
    case "colorScale": {
      const colors = (Array.isArray(x.color) ? x.color : []).map(hexOf).filter((c): c is string => !!c);
      return colors.length >= 2 ? { id: base.id, range, type: "scale", colors } : null;
    }
    case "dataBar": {
      const c = hexOf(Array.isArray(x.color) ? x.color[0] : x.color);
      return { id: base.id, range, type: "bars", colors: [c ?? "#638ec6"] };
    }
  }
  return null;
}

/**
 * La librería devuelve una lista por celda: las celdas seguidas de una misma
 * columna con la misma lista se vuelven a juntar en un rango.
 */
function mergeValidations(list: NonNullable<Sheet["validations"]>): NonNullable<Sheet["validations"]> {
  const groups = new Map<string, { r: number; c: number; v: (typeof list)[number] }[]>();
  for (const v of list) {
    const g = parseRange(v.range)!;
    const sig = JSON.stringify([v.list, v.source, v.strict]);
    const arr = groups.get(sig) ?? [];
    for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) arr.push({ r, c, v });
    groups.set(sig, arr);
  }
  const out: NonNullable<Sheet["validations"]> = [];
  for (const cells of groups.values()) {
    cells.sort((a, b) => a.c - b.c || a.r - b.r);
    let start = cells[0];
    let prev = cells[0];
    const flush = (end: typeof prev) => out.push({ ...start.v, id: Math.random().toString(36).slice(2, 10), range: rangeToA1({ r1: start.r, c1: start.c, r2: end.r, c2: end.c }) });
    for (const cell of cells.slice(1)) {
      if (cell.c === prev.c && cell.r === prev.r + 1) {
        prev = cell;
        continue;
      }
      flush(prev);
      start = prev = cell;
    }
    flush(prev);
  }
  return out;
}

const excelValue = (v: Scalar): ExcelJS.CellValue => (v instanceof FErr ? { error: v.code as ExcelJS.CellErrorValue["error"] } : v);

export async function buildXlsx(wb: Workbook): Promise<Uint8Array> {
  const book = new ExcelJS.Workbook();
  book.creator = "Lumen Office";
  book.created = new Date();
  const ev = new Evaluator(wb);
  wb.sheets.forEach((s, si) => {
    const ws = book.addWorksheet(s.name.slice(0, 31), {
      views: [
        s.freezeR || s.freezeC
          ? { state: "frozen", xSplit: s.freezeC ?? 0, ySplit: s.freezeR ?? 0, showGridLines: s.showGrid !== false }
          : { showGridLines: s.showGrid !== false },
      ],
    });
    for (const [c, w] of Object.entries(s.colW)) ws.getColumn(Number(c) + 1).width = Math.round((w / 7.2) * 100) / 100;
    for (const [r, h] of Object.entries(s.rowH)) ws.getRow(Number(r) + 1).height = h * 0.75;
    for (const k in s.cells) {
      const cell = s.cells[k];
      const [r, c] = parseKey(k);
      const xc = ws.getCell(r + 1, c + 1);
      if (cell.v.startsWith("=") && cell.v.length > 1 && cell.s?.fmt !== "text") {
        const result = ev.value(si, r, c);
        xc.value = { formula: toExcelFormula(cell.v), result: excelValue(result) } as ExcelJS.CellFormulaValue;
      } else if (cell.v !== "") {
        const v = cell.s?.fmt === "text" ? cell.v : ev.value(si, r, c);
        xc.value = excelValue(v);
      }
      const st = cell.s;
      if (!st) continue;
      if (st.b || st.i || st.u || st.s || st.color || st.fs || st.font) {
        xc.font = {
          bold: st.b,
          italic: st.i,
          underline: st.u,
          strike: st.s,
          color: st.color ? { argb: argb(st.color) } : undefined,
          size: st.fs,
          name: st.font,
        };
      }
      if (st.bg) xc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(st.bg) } };
      if (st.align || st.valign || st.wrap) {
        xc.alignment = { horizontal: st.align, vertical: st.valign, wrapText: st.wrap };
      }
      if (st.bt || st.br || st.bb || st.bl) {
        const thin = { style: "thin" as const, color: { argb: "FF7F7F7F" } };
        xc.border = { top: st.bt ? thin : undefined, right: st.br ? thin : undefined, bottom: st.bb ? thin : undefined, left: st.bl ? thin : undefined };
      }
      const nf = excelNumFmt(st);
      if (nf) xc.numFmt = nf;
    }
    for (const m of s.merges ?? []) ws.mergeCells(m.r1 + 1, m.c1 + 1, m.r2 + 1, m.c2 + 1);
    // Comentarios y listas desplegables
    for (const [k, text] of Object.entries(s.notes ?? {})) {
      const [r, c] = parseKey(k);
      ws.getCell(r + 1, c + 1).note = text;
    }
    for (const v of s.validations ?? []) {
      const list = v.list?.length ? [`"${v.list.join(",").replace(/"/g, "")}"`] : v.source ? [v.source.replace(/^=/, "")] : null;
      if (!list) continue;
      (ws as unknown as { dataValidations: { add: (ref: string, dv: object) => void } }).dataValidations.add(v.range, {
        type: "list",
        allowBlank: true,
        formulae: list,
        showErrorMessage: !!v.strict,
        errorTitle: "Valor no válido",
        error: "Elige un valor de la lista.",
      });
    }
    // Filtro, filas y columnas ocultas
    if (s.filter) ws.autoFilter = rangeToA1(filterRange(s, s.filter));
    for (const r of hiddenRows(s, ev, si)) ws.getRow(r + 1).hidden = true;
    for (const c of s.hiddenCols ?? []) ws.getColumn(c + 1).hidden = true;
    // Formato condicional
    (s.cond ?? []).forEach((rule, i) => {
      const x = excelRule(rule, s.cond!.length - i);
      if (x) ws.addConditionalFormatting({ ref: rule.range, rules: [x] });
    });
  });
  return new Uint8Array(await book.xlsx.writeBuffer());
}

/* ------------------------------------------------------------------ */
/*  Importar                                                           */
/* ------------------------------------------------------------------ */

const hex = (c?: Partial<ExcelJS.Color>) => (c?.argb && c.argb.length >= 6 ? "#" + c.argb.slice(-6).toLowerCase() : undefined);

function fmtFromExcel(nf: string | undefined): Pick<CellStyle, "fmt" | "dec"> {
  if (!nf || nf === "General") return {};
  if (nf === "@") return { fmt: "text" };
  const dec = (/\.(0+)/.exec(nf)?.[1] ?? "").length;
  if (nf.includes("%")) return { fmt: "percent", dec };
  if (/[€$£]/.test(nf)) return { fmt: "currency", dec };
  if (/E\+/i.test(nf)) return { fmt: "scientific", dec };
  const date = /[dy]/i.test(nf.replace(/"[^"]*"/g, ""));
  const time = /h/i.test(nf.replace(/"[^"]*"/g, ""));
  if (date && time) return { fmt: "datetime" };
  if (date) return { fmt: "date" };
  if (time) return { fmt: "time" };
  if (nf.includes("#,##")) return { fmt: "thousands", dec };
  if (/^0(\.0+)?$/.test(nf)) return { fmt: "number", dec };
  return {};
}

const jsDateToSerial = (d: Date) =>
  dateToSerial(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()) + (d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds()) / 86400;

function readValue(v: ExcelJS.CellValue): { v: string; date?: boolean } {
  if (v === null || v === undefined) return { v: "" };
  if (typeof v === "number") return { v: String(v) };
  if (typeof v === "boolean") return { v: v ? "TRUE" : "FALSE" };
  if (typeof v === "string") return { v };
  if (v instanceof Date) return { v: String(jsDateToSerial(v)), date: true };
  if (typeof v === "object") {
    if ("formula" in v && v.formula) return { v: "=" + v.formula };
    if ("sharedFormula" in v) {
      const f = (v as { formula?: string }).formula;
      if (f) return { v: "=" + f };
      return readValue((v as ExcelJS.CellSharedFormulaValue).result as ExcelJS.CellValue);
    }
    if ("richText" in v) return { v: v.richText.map((t) => t.text).join("") };
    if ("text" in v && "hyperlink" in v) return { v: String(v.text) };
    if ("error" in v) return { v: String(v.error) };
    if ("result" in v) return readValue(v.result as ExcelJS.CellValue);
  }
  return { v: String(v) };
}

export async function readXlsx(data: ArrayBuffer): Promise<Workbook> {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(data);
  const sheets: Sheet[] = [];
  book.eachSheet((ws) => {
    const s = newSheet(ws.name);
    let maxR = 0;
    let maxC = 0;
    ws.eachRow({ includeEmpty: false }, (row, rn) => {
      if (row.height && Math.abs(row.height / 0.75 - DEFAULT_ROW_H) > 1) s.rowH[rn - 1] = Math.round(row.height / 0.75);
      row.eachCell({ includeEmpty: false }, (xc, cn) => {
        const { v, date } = readValue(xc.value);
        const st: CellStyle = {};
        const f = xc.font;
        if (f) {
          if (f.bold) st.b = true;
          if (f.italic) st.i = true;
          if (f.underline) st.u = true;
          if (f.strike) st.s = true;
          const col = hex(f.color);
          if (col && col !== "#000000") st.color = col;
          if (f.size && f.size !== 11) st.fs = f.size;
          if (f.name && f.name !== "Calibri") st.font = f.name;
        }
        const fill = xc.fill as ExcelJS.FillPattern | undefined;
        if (fill?.type === "pattern" && fill.pattern === "solid") {
          const bg = hex(fill.fgColor);
          if (bg) st.bg = bg;
        }
        const al = xc.alignment;
        if (al) {
          if (al.horizontal === "left" || al.horizontal === "center" || al.horizontal === "right") st.align = al.horizontal;
          if (al.vertical === "top" || al.vertical === "middle" || al.vertical === "bottom") st.valign = al.vertical;
          if (al.wrapText) st.wrap = true;
        }
        const b = xc.border;
        if (b) {
          if (b.top?.style) st.bt = true;
          if (b.right?.style) st.br = true;
          if (b.bottom?.style) st.bb = true;
          if (b.left?.style) st.bl = true;
        }
        Object.assign(st, fmtFromExcel(xc.numFmt));
        if (date && !st.fmt) st.fmt = "date";
        const cell: Cell = { v };
        if (Object.keys(st).length) cell.s = st;
        const note = xc.note as unknown as string | { texts?: { text: string }[] } | undefined;
        const noteText = typeof note === "string" ? note : note?.texts?.map((t) => t.text).join("") ?? "";
        if (noteText) s.notes = { ...(s.notes ?? {}), [key(rn - 1, cn - 1)]: noteText };
        if (v !== "" || cell.s) {
          s.cells[key(rn - 1, cn - 1)] = cell;
          maxR = Math.max(maxR, rn);
          maxC = Math.max(maxC, cn);
        }
      });
    });
    const cols = ws.columns ?? [];
    cols.forEach((col, i) => {
      if (col?.width && Math.abs(col.width * 7.2 - DEFAULT_COL_W) > 2) s.colW[i] = Math.round(col.width * 7.2);
    });
    const merges = (ws.model as { merges?: string[] }).merges ?? [];
    s.merges = merges.map((m) => parseRange(m)).filter((m): m is NonNullable<typeof m> => !!m);
    const view = ws.views?.[0] as { state?: string; xSplit?: number; ySplit?: number; showGridLines?: boolean } | undefined;
    if (view?.state === "frozen") {
      if (view.ySplit) s.freezeR = view.ySplit;
      if (view.xSplit) s.freezeC = view.xSplit;
    }
    if (view?.showGridLines === false) s.showGrid = false;
    const af = ws.autoFilter as unknown;
    const afRange = typeof af === "string" ? parseRange(af) : null;
    if (afRange) s.filter = { ...afRange, show: {} };
    const hc: number[] = [];
    cols.forEach((col, i) => col?.hidden && hc.push(i));
    if (hc.length) s.hiddenCols = hc;
    // Formato condicional: Excel da la prioridad al número más bajo; aquí manda la última regla
    const cfs = (ws as unknown as { conditionalFormattings?: { ref: string; rules: ExcelCfRule[] }[] }).conditionalFormattings ?? [];
    const rules: { rule: CondRule; priority: number }[] = [];
    for (const cf of cfs) for (const x of cf.rules ?? []) {
      const rule = ruleFromExcel(cf.ref, x);
      if (rule) rules.push({ rule, priority: x.priority ?? 0 });
    }
    if (rules.length) s.cond = rules.sort((a, b) => b.priority - a.priority).map((x) => x.rule);
    // Listas desplegables
    const dvs = (ws as unknown as { dataValidations?: { model?: Record<string, { type?: string; formulae?: string[]; showErrorMessage?: boolean }> } }).dataValidations?.model ?? {};
    const validations: NonNullable<Sheet["validations"]> = [];
    for (const [ref, dv] of Object.entries(dvs)) {
      if (dv.type !== "list" || !dv.formulae?.[0]) continue;
      const range = ref.replace(/^range:/, "").split(/\s+/)[0];
      if (!parseRange(range)) continue;
      const f = String(dv.formulae[0]);
      const v = /^".*"$/.test(f)
        ? { list: f.slice(1, -1).split(",").map((x) => x.trim()).filter(Boolean) }
        : { source: f };
      validations.push({ id: Math.random().toString(36).slice(2, 10), range, strict: !!dv.showErrorMessage, ...v });
    }
    if (validations.length) s.validations = mergeValidations(validations);
    s.rows = Math.max(200, maxR + 50);
    s.cols = Math.max(26, maxC + 5);
    sheets.push(s);
  });
  if (!sheets.length) sheets.push(newSheet("Hoja1"));
  return { sheets, active: 0 };
}

/* ------------------------------------------------------------------ */
/*  CSV                                                                */
/* ------------------------------------------------------------------ */

/** CSV de la hoja activa, con «;» y coma decimal (como lo abre Excel en español). */
export function buildCsv(wb: Workbook): string {
  const s = wb.sheets[wb.active];
  const used = usedRange(s);
  if (!used) return "";
  const ev = new Evaluator(wb);
  const lines: string[] = [];
  for (let r = 0; r <= used.r2; r++) {
    const row: string[] = [];
    for (let c = 0; c <= used.c2; c++) {
      const v = ev.value(wb.active, r, c);
      const st = s.cells[key(r, c)]?.s;
      // Sin separador de miles ni símbolos, para que se pueda volver a leer como número
      let text = typeof v === "number" && (!st?.fmt || ["general", "number", "thousands", "currency", "scientific"].includes(st.fmt))
        ? String(v).replace(".", ",")
        : formatValue(v, st);
      if (/[;"\n\r]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
      row.push(text);
    }
    lines.push(row.join(";"));
  }
  return "﻿" + lines.join("\r\n");
}

function splitCsv(text: string, sep: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) {
      row.push(cur);
      cur = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
    } else cur += ch;
  }
  if (cur !== "" || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

export function readCsv(text: string, name = "Hoja1"): Workbook {
  const clean = text.replace(/^﻿/, "");
  const first = clean.split(/\r?\n/, 1)[0] ?? "";
  const counts = [";", ",", "\t"].map((c) => [c, first.split(c).length] as const).sort((a, b) => b[1] - a[1]);
  const sep = counts[0][1] > 1 ? counts[0][0] : ";";
  const rows = splitCsv(clean, sep);
  const s = newSheet(name.slice(0, 31) || "Hoja1");
  let maxC = 0;
  rows.forEach((row, r) =>
    row.forEach((raw, c) => {
      if (raw === "") return;
      const { v, fmt } = parseInput(raw);
      s.cells[key(r, c)] = fmt ? { v, s: { fmt } } : { v };
      maxC = Math.max(maxC, c + 1);
    }),
  );
  s.rows = Math.max(200, rows.length + 50);
  s.cols = Math.max(26, maxC + 5);
  return { sheets: [s], active: 0 };
}

/* ------------------------------------------------------------------ */
/*  Página web (para imprimir y PDF)                                   */
/* ------------------------------------------------------------------ */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Tabla HTML con el área usada de una hoja, con su formato. */
export function sheetHtml(wb: Workbook, si: number): string {
  const s = wb.sheets[si];
  const used = usedRange(s);
  if (!used) return "<p></p>";
  const ev = new Evaluator(wb);
  const covered = new Set<string>();
  // Como en pantalla: sin las filas filtradas u ocultas y con el formato condicional
  const hRows = hiddenRows(s, ev, si);
  const hCols = new Set(s.hiddenCols ?? []);
  const cf = condFormatter(s, ev, si);
  let html = `<table class="sheet-print-table"><colgroup>`;
  for (let c = 0; c <= used.c2; c++) if (!hCols.has(c)) html += `<col style="width:${s.colW[c] ?? DEFAULT_COL_W}px">`;
  html += "</colgroup>";
  for (let r = 0; r <= used.r2; r++) {
    if (hRows.has(r)) continue;
    html += `<tr style="height:${s.rowH[r] ?? DEFAULT_ROW_H}px">`;
    for (let c = 0; c <= used.c2; c++) {
      if (covered.has(key(r, c)) || hCols.has(c)) continue;
      const cell = s.cells[key(r, c)];
      const cond = cf?.(r, c);
      const st: CellStyle = cond ? { ...cell?.s, bg: cond.bg ?? cell?.s?.bg, color: cond.color ?? cell?.s?.color, b: cond.bold || cell?.s?.b } : (cell?.s ?? {});
      const v = ev.value(si, r, c);
      const m = s.merges?.find((x) => x.r1 === r && x.c1 === c);
      let span = "";
      if (m) {
        for (let rr = m.r1; rr <= m.r2; rr++) for (let cc = m.c1; cc <= m.c2; cc++) if (rr !== r || cc !== c) covered.add(key(rr, cc));
        span = ` rowspan="${m.r2 - m.r1 + 1}" colspan="${m.c2 - m.c1 + 1}"`;
      }
      const css = [
        st.b && "font-weight:700",
        st.i && "font-style:italic",
        (st.u || st.s) && `text-decoration:${[st.u && "underline", st.s && "line-through"].filter(Boolean).join(" ")}`,
        st.color && `color:${st.color}`,
        cond?.bar
          ? `background:linear-gradient(90deg,${cond.bar.color} ${Math.round(cond.bar.pct * 100)}%,${st.bg ?? "transparent"} ${Math.round(cond.bar.pct * 100)}%)`
          : st.bg && `background:${st.bg}`,
        st.fs && `font-size:${st.fs}pt`,
        st.font && `font-family:${st.font}`,
        `text-align:${st.align ?? (typeof v === "number" ? "right" : "left")}`,
        st.wrap ? "white-space:pre-wrap" : "white-space:nowrap",
        st.bt && "border-top:1px solid #777",
        st.br && "border-right:1px solid #777",
        st.bb && "border-bottom:1px solid #777",
        st.bl && "border-left:1px solid #777",
      ]
        .filter(Boolean)
        .join(";");
      html += `<td${span} style="${css}">${esc(formatValue(v, st))}</td>`;
    }
    html += "</tr>";
  }
  return html + "</table>";
}
