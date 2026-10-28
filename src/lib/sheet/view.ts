import { FErr, type Evaluator, type Scalar } from "@/lib/sheet/formula";
import { formatValue, parseNumber } from "@/lib/sheet/format";
import { key, parseRange, type CondRule, type Range, type Sheet, type SheetFilter, type Validation } from "@/lib/sheet/model";

/*
 * Lo que cambia cómo se ve la hoja sin cambiar sus datos: filas ocultas por el
 * filtro y formato condicional.
 */

/** Rango real del filtro: crece solo si se añaden filas justo debajo. */
export function filterRange(s: Sheet, f: SheetFilter): Range {
  let r2 = f.r2;
  const hasRow = (r: number) => {
    for (let c = f.c1; c <= f.c2; c++) if (s.cells[key(r, c)]?.v) return true;
    return false;
  };
  while (r2 + 1 < s.rows && hasRow(r2 + 1)) r2++;
  return { r1: f.r1, c1: f.c1, r2, c2: f.c2 };
}

/** Texto con el que se compara una celda en el filtro. */
export const filterText = (v: Scalar, s?: Parameters<typeof formatValue>[1]) => formatValue(v, s);

/** Filas ocultas: a mano o porque no cumplen el filtro. */
export function hiddenRows(s: Sheet, ev: Evaluator, si: number): Set<number> {
  const out = new Set<number>(s.hiddenRows ?? []);
  const f = s.filter;
  if (!f) return out;
  const cols = Object.keys(f.show).map(Number);
  if (!cols.length) return out;
  const rg = filterRange(s, f);
  const allowed = new Map(cols.map((c) => [c, new Set(f.show[c])]));
  for (let r = rg.r1 + 1; r <= rg.r2; r++) {
    for (const c of cols) {
      const text = filterText(ev.value(si, r, c), s.cells[key(r, c)]?.s);
      if (!allowed.get(c)!.has(text)) {
        out.add(r);
        break;
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Formato condicional                                                */
/* ------------------------------------------------------------------ */

export interface CondStyle {
  bg?: string;
  color?: string;
  bold?: boolean;
  /** Barra de datos: proporción 0..1 y color */
  bar?: { pct: number; color: string };
}

export const COND_PRESETS: { id: string; label: string; bg: string; color: string }[] = [
  { id: "red", label: "Relleno rojo claro con texto rojo oscuro", bg: "#ffc7ce", color: "#9c0006" },
  { id: "yellow", label: "Relleno amarillo con texto amarillo oscuro", bg: "#ffeb9c", color: "#9c5700" },
  { id: "green", label: "Relleno verde con texto verde oscuro", bg: "#c6efce", color: "#006100" },
  { id: "blue", label: "Relleno azul claro", bg: "#dbeafe", color: "#1e3a8a" },
];

export const SCALE_PRESETS: { id: string; label: string; colors: string[] }[] = [
  { id: "gyr", label: "Verde, amarillo y rojo", colors: ["#63be7b", "#ffeb84", "#f8696b"] },
  { id: "ryg", label: "Rojo, amarillo y verde", colors: ["#f8696b", "#ffeb84", "#63be7b"] },
  { id: "wg", label: "Blanco y verde", colors: ["#ffffff", "#63be7b"] },
  { id: "wb", label: "Blanco y azul", colors: ["#ffffff", "#5a8ac6"] },
];

export const BAR_COLORS = ["#638ec6", "#63c384", "#ff555a", "#ffb628", "#008aef", "#d6007b"];

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
function mix(a: string, b: string, t: number): string {
  const x = hex(a);
  const y = hex(b);
  return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("");
}

const num = (s?: string) => (s === undefined || s.trim() === "" ? null : parseNumber(s));

interface Prepared {
  rule: CondRule;
  rg: Range;
  min: number;
  max: number;
  avg: number;
  threshold: number;
  counts: Map<string, number>;
}

/** Devuelve una función que da el formato condicional de cada celda (o null). */
export function condFormatter(s: Sheet, ev: Evaluator, si: number): ((r: number, c: number) => CondStyle | null) | null {
  const rules = s.cond ?? [];
  if (!rules.length) return null;
  const prepared: Prepared[] = [];
  for (const rule of rules) {
    const rg = parseRange(rule.range);
    if (!rg) continue;
    const nums: number[] = [];
    const counts = new Map<string, number>();
    // Límite razonable para no recorrer columnas enteras vacías
    const r2 = Math.min(rg.r2, s.rows - 1);
    const c2 = Math.min(rg.c2, s.cols - 1);
    for (let r = rg.r1; r <= r2; r++)
      for (let c = rg.c1; c <= c2; c++) {
        const v = ev.value(si, r, c);
        if (typeof v === "number") nums.push(v);
        if (rule.type === "dup" || rule.type === "unique") {
          if (v === null || v === "") continue;
          const t = formatValue(v).toLowerCase();
          counts.set(t, (counts.get(t) ?? 0) + 1);
        }
      }
    const sorted = [...nums].sort((a, b) => a - b);
    const n = Math.max(1, Math.round(num(rule.a) ?? 10));
    prepared.push({
      rule,
      rg,
      min: sorted[0] ?? 0,
      max: sorted[sorted.length - 1] ?? 0,
      avg: nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0,
      threshold: rule.type === "top" ? (sorted[Math.max(0, sorted.length - n)] ?? Infinity) : rule.type === "bottom" ? (sorted[Math.min(sorted.length - 1, n - 1)] ?? -Infinity) : 0,
      counts,
    });
  }
  if (!prepared.length) return null;

  return (r, c) => {
    let out: CondStyle | null = null;
    for (const p of prepared) {
      const { rg, rule } = p;
      if (r < rg.r1 || r > rg.r2 || c < rg.c1 || c > rg.c2) continue;
      const v = ev.value(si, r, c);
      if (v instanceof FErr) continue;
      const x = typeof v === "number" ? v : null;
      let hit = false;
      switch (rule.type) {
        case "gt":
          hit = x !== null && num(rule.a) !== null && x > num(rule.a)!;
          break;
        case "lt":
          hit = x !== null && num(rule.a) !== null && x < num(rule.a)!;
          break;
        case "between": {
          const a = num(rule.a);
          const b = num(rule.b);
          hit = x !== null && a !== null && b !== null && x >= Math.min(a, b) && x <= Math.max(a, b);
          break;
        }
        case "eq":
          hit = x !== null && num(rule.a) !== null ? x === num(rule.a) : formatValue(v).toLowerCase() === (rule.a ?? "").toLowerCase();
          break;
        case "text":
          hit = !!rule.a && formatValue(v).toLowerCase().includes(rule.a.toLowerCase());
          break;
        case "dup":
        case "unique": {
          if (v === null || v === "") break;
          const count = p.counts.get(formatValue(v).toLowerCase()) ?? 0;
          hit = rule.type === "dup" ? count > 1 : count === 1;
          break;
        }
        case "top":
          hit = x !== null && x >= p.threshold;
          break;
        case "bottom":
          hit = x !== null && x <= p.threshold;
          break;
        case "aboveAvg":
          hit = x !== null && x > p.avg;
          break;
        case "belowAvg":
          hit = x !== null && x < p.avg;
          break;
        case "bars":
          if (x !== null) {
            const lo = Math.min(0, p.min);
            const span = p.max - lo || 1;
            out = { ...(out ?? {}), bar: { pct: Math.max(0, Math.min(1, (x - lo) / span)), color: rule.colors?.[0] ?? BAR_COLORS[0] } };
          }
          continue;
        case "scale":
          if (x !== null) {
            const cols = rule.colors?.length ? rule.colors : SCALE_PRESETS[0].colors;
            const t = p.max === p.min ? 0.5 : (x - p.min) / (p.max - p.min);
            const bg = cols.length === 3 ? (t < 0.5 ? mix(cols[0], cols[1], t * 2) : mix(cols[1], cols[2], (t - 0.5) * 2)) : mix(cols[0], cols[1], t);
            out = { ...(out ?? {}), bg };
          }
          continue;
      }
      if (hit) out = { ...(out ?? {}), bg: rule.bg ?? out?.bg, color: rule.color ?? out?.color, bold: rule.bold || out?.bold };
    }
    return out;
  };
}

export const COND_LABELS: Record<CondRule["type"], string> = {
  gt: "Mayor que",
  lt: "Menor que",
  between: "Entre",
  eq: "Igual a",
  text: "Texto que contiene",
  dup: "Valores duplicados",
  unique: "Valores únicos",
  top: "Los mejores",
  bottom: "Los peores",
  aboveAvg: "Por encima del promedio",
  belowAvg: "Por debajo del promedio",
  bars: "Barras de datos",
  scale: "Escala de color",
};

/* ------------------------------------------------------------------ */
/*  Listas desplegables                                                */
/* ------------------------------------------------------------------ */

export function validationAt(s: Sheet, r: number, c: number): Validation | undefined {
  return s.validations?.find((v) => {
    const g = parseRange(v.range);
    return !!g && r >= g.r1 && r <= g.r2 && c >= g.c1 && c <= g.c2;
  });
}

/** Opciones de una lista: las escritas o las de su rango de origen. */
export function validationOptions(v: Validation, ev: Evaluator, si: number): string[] {
  if (v.list?.length) return v.list;
  if (!v.source) return [];
  const val = ev.evaluate(v.source.replace(/^=/, ""), si);
  const out: string[] = [];
  const push = (x: Scalar) => {
    const t = formatValue(x);
    if (t !== "" && !out.includes(t)) out.push(t);
  };
  if (Array.isArray(val)) for (const row of val) for (const x of row) push(x);
  else push(val);
  return out;
}
