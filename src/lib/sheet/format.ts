import { FErr, dateToSerial, serialToDate, type Scalar } from "@/lib/sheet/formula";
import type { CellStyle, NumFmt } from "@/lib/sheet/model";

/*
 * Formato de los valores (como se ven en la celda) y lectura de lo que escribe
 * el usuario (números con coma decimal, porcentajes, fechas, importes en euros…).
 */

export const NUM_FORMATS: { id: NumFmt; label: string; example: string }[] = [
  { id: "general", label: "General", example: "1234,5" },
  { id: "number", label: "Número", example: "1234,50" },
  { id: "thousands", label: "Número con miles", example: "1.234,50" },
  { id: "currency", label: "Moneda (€)", example: "1.234,50 €" },
  { id: "percent", label: "Porcentaje", example: "12,50 %" },
  { id: "date", label: "Fecha", example: "28/10/2026" },
  { id: "time", label: "Hora", example: "14:30" },
  { id: "datetime", label: "Fecha y hora", example: "28/10/2026 14:30" },
  { id: "scientific", label: "Científico", example: "1,23E+03" },
  { id: "text", label: "Texto", example: "0012" },
];

const pad = (n: number) => String(n).padStart(2, "0");

function fmtNumber(n: number, dec: number, grouping: boolean) {
  return n.toLocaleString("es-ES", { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: grouping ? "always" : false });
}

function general(n: number): string {
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
  const abs = Math.abs(n);
  if (abs !== 0 && (abs >= 1e11 || abs < 1e-9)) return n.toExponential(4).replace(".", ",").replace("e", "E");
  return n.toLocaleString("es-ES", { maximumSignificantDigits: 11, useGrouping: false });
}

export function formatDate(n: number, time: boolean, date = true): string {
  const d = serialToDate(n);
  const ds = `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
  const ts = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  return date && time ? `${ds} ${ts}` : time ? ts : ds;
}

/** Texto que muestra una celda con su valor calculado. */
export function formatValue(v: Scalar, s?: CellStyle): string {
  if (v === null) return "";
  if (v instanceof FErr) return v.code;
  if (typeof v === "boolean") return v ? "VERDADERO" : "FALSO";
  if (typeof v === "string") return v;
  const fmt = s?.fmt ?? "general";
  const dec = s?.dec;
  switch (fmt) {
    case "number":
      return fmtNumber(v, dec ?? 2, false);
    case "thousands":
      return fmtNumber(v, dec ?? 2, true);
    case "currency":
      return `${fmtNumber(v, dec ?? 2, true)} €`;
    case "percent":
      return `${fmtNumber(v * 100, dec ?? 2, false)} %`;
    case "date":
      return formatDate(v, false);
    case "time":
      return formatDate(v, true, false);
    case "datetime":
      return formatDate(v, true);
    case "scientific":
      return v.toExponential(dec ?? 2).replace(".", ",").replace("e", "E");
    default:
      return dec !== undefined ? fmtNumber(v, dec, false) : general(v);
  }
}

/** Alineación por defecto: números a la derecha, textos a la izquierda, lógicos y errores al centro. */
export function defaultAlign(v: Scalar): "left" | "right" | "center" {
  if (typeof v === "number") return "right";
  if (typeof v === "boolean" || v instanceof FErr) return "center";
  return "left";
}

/**
 * Lee lo que el usuario escribe en una celda. Devuelve lo que se guarda y, si
 * procede, el formato que se deduce (porcentaje, moneda, fecha…).
 */
export function parseInput(raw: string, current?: CellStyle): { v: string; fmt?: NumFmt } {
  const t = raw.trim();
  if (t === "" || raw.startsWith("=") || current?.fmt === "text") return { v: raw };
  // Un apóstrofo delante fuerza texto
  if (raw.startsWith("'")) return { v: raw.slice(1), fmt: "text" };
  const n = parseNumber(t);
  if (n !== null) return { v: String(n) };
  let m = /^([-+]?[\d.,]+)\s*%$/.exec(t);
  if (m) {
    const x = parseNumber(m[1]);
    if (x !== null) return { v: String(Number((x / 100).toPrecision(15))), fmt: "percent" };
  }
  m = /^([-+]?[\d.,]+)\s*€$/.exec(t) ?? /^€\s*([-+]?[\d.,]+)$/.exec(t);
  if (m) {
    const x = parseNumber(m[1]);
    if (x !== null) return { v: String(x), fmt: "currency" };
  }
  // Fechas: 28/10/2026, 28-10-26, 2026-10-28; con hora opcional
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?$/.exec(t);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const d = Number(m[1]);
    const mo = Number(m[2]);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      const time = m[4] ? (Number(m[4]) * 60 + Number(m[5])) / 1440 : 0;
      return { v: String(dateToSerial(y, mo, d) + time), fmt: m[4] ? "datetime" : "date" };
    }
  }
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) return { v: String(dateToSerial(Number(m[1]), Number(m[2]), Number(m[3]))), fmt: "date" };
  m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (m && Number(m[1]) < 24) return { v: String((Number(m[1]) * 60 + Number(m[2])) / 1440), fmt: "time" };
  return { v: raw };
}

/** Número escrito al estilo español (1.234,5) o internacional (1234.5). */
export function parseNumber(t: string): number | null {
  const s = t.trim();
  if (!/^[-+]?[\d.,]*\d[\d.,]*(e[-+]?\d+)?$/i.test(s)) return null;
  let norm: string;
  if (s.includes(",")) {
    // La coma es la de los decimales; los puntos, los miles
    if ((s.match(/,/g) ?? []).length > 1) return null;
    norm = s.replace(/\./g, "").replace(",", ".");
  } else if (/^[-+]?\d{1,3}(\.\d{3})+$/.test(s)) {
    norm = s.replace(/\./g, "");
  } else norm = s;
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

/** Texto para editar una celda: los números se muestran con coma decimal. */
export function editText(v: string, s?: CellStyle): string {
  if (v === "" || v.startsWith("=") || s?.fmt === "text") return v;
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(v)) return v;
  const n = Number(v);
  switch (s?.fmt) {
    case "percent":
      return `${String(Number((n * 100).toPrecision(12))).replace(".", ",")}%`;
    case "date":
      return formatDate(n, false);
    case "datetime":
      return formatDate(n, true);
    case "time":
      return formatDate(n, true, false);
    default:
      return v.replace(".", ",");
  }
}
