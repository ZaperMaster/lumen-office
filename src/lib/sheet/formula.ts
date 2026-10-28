import { colIndex, colName, parseKey, type Sheet, type Workbook } from "@/lib/sheet/model";

/*
 * Motor de fórmulas: analiza y calcula fórmulas al estilo de Excel.
 *
 *  - Referencias A1, $A$1, rangos A1:B5, columnas enteras A:A y otras hojas (Hoja2!A1, 'Mi hoja'!A1).
 *  - Operadores + - * / ^ & % y comparaciones.
 *  - Funciones con su nombre en inglés o en español (SUMA, PROMEDIO, SI, BUSCARV…).
 *  - Los argumentos se separan con «;» o «,»; los decimales llevan punto.
 */

/* ------------------------------------------------------------------ */
/*  Valores y errores                                                  */
/* ------------------------------------------------------------------ */

export class FErr {
  constructor(public code: "#DIV/0!" | "#N/A" | "#NAME?" | "#NUM!" | "#REF!" | "#VALUE!" | "#CIRC!" | "#ERROR!") {}
  toString() {
    return this.code;
  }
}

export type Scalar = number | string | boolean | null | FErr;
export type Matrix = Scalar[][];
export type Value = Scalar | Matrix;

const isMatrix = (v: Value): v is Matrix => Array.isArray(v);

/* ------------------------------------------------------------------ */
/*  Fechas (número de serie como en Excel: días desde el 30/12/1899)   */
/* ------------------------------------------------------------------ */

const EPOCH = Date.UTC(1899, 11, 30);
export const dateToSerial = (y: number, m: number, d: number) => (Date.UTC(y, m - 1, d) - EPOCH) / 86400000;
export function serialToDate(n: number): Date {
  return new Date(EPOCH + Math.round(n * 86400000));
}
export function nowSerial(): number {
  const d = new Date();
  return dateToSerial(d.getFullYear(), d.getMonth() + 1, d.getDate()) + (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400;
}

/* ------------------------------------------------------------------ */
/*  Nombres de funciones en español                                    */
/* ------------------------------------------------------------------ */

const ES: Record<string, string> = {
  SUMA: "SUM", PROMEDIO: "AVERAGE", CONTAR: "COUNT", CONTARA: "COUNTA", "CONTAR.BLANCO": "COUNTBLANK", PRODUCTO: "PRODUCT",
  MEDIANA: "MEDIAN", MODA: "MODE", DESVEST: "STDEV", "DESVEST.M": "STDEV", REDONDEAR: "ROUND", "REDONDEAR.MAS": "ROUNDUP",
  "REDONDEAR.MENOS": "ROUNDDOWN", ENTERO: "INT", RESIDUO: "MOD", POTENCIA: "POWER", RAIZ: "SQRT", ALEATORIO: "RAND",
  "ALEATORIO.ENTRE": "RANDBETWEEN", "MULTIPLO.SUPERIOR": "CEILING", "MULTIPLO.INFERIOR": "FLOOR", SIGNO: "SIGN", TRUNCAR: "TRUNC",
  SI: "IF", "SI.CONJUNTO": "IFS", "SI.ERROR": "IFERROR", "SI.ND": "IFNA", Y: "AND", O: "OR", NO: "NOT", XO: "XOR",
  VERDADERO: "TRUE", FALSO: "FALSE", ESBLANCO: "ISBLANK", ESNUMERO: "ISNUMBER", ESTEXTO: "ISTEXT", ESERROR: "ISERROR",
  CONCATENAR: "CONCATENATE", UNIRCADENAS: "TEXTJOIN", LARGO: "LEN", MAYUSC: "UPPER", MINUSC: "LOWER", NOMPROPIO: "PROPER",
  ESPACIOS: "TRIM", IZQUIERDA: "LEFT", DERECHA: "RIGHT", EXTRAE: "MID", ENCONTRAR: "FIND", HALLAR: "SEARCH",
  SUSTITUIR: "SUBSTITUTE", REEMPLAZAR: "REPLACE", REPETIR: "REPT", TEXTO: "TEXT", VALOR: "VALUE", IGUAL: "EXACT",
  HOY: "TODAY", AHORA: "NOW", FECHA: "DATE", "AÑO": "YEAR", ANO: "YEAR", MES: "MONTH", DIA: "DAY", DIASEM: "WEEKDAY",
  HORA: "HOUR", MINUTO: "MINUTE", DIAS: "DAYS", "FECHA.MES": "EDATE", "FIN.MES": "EOMONTH", "SUMAR.SI": "SUMIF",
  "SUMAR.SI.CONJUNTO": "SUMIFS", "CONTAR.SI": "COUNTIF", "CONTAR.SI.CONJUNTO": "COUNTIFS", "PROMEDIO.SI": "AVERAGEIF", "PROMEDIO.SI.CONJUNTO": "AVERAGEIFS", "MAX.SI.CONJUNTO": "MAXIFS", "MIN.SI.CONJUNTO": "MINIFS",
  BUSCARV: "VLOOKUP", BUSCARH: "HLOOKUP", INDICE: "INDEX", COINCIDIR: "MATCH", BUSCARX: "XLOOKUP", ELEGIR: "CHOOSE",
  FILAS: "ROWS", COLUMNAS: "COLUMNS", "K.ESIMO.MAYOR": "LARGE", "K.ESIMO.MENOR": "SMALL", JERARQUIA: "RANK",
  "JERARQUIA.EQV": "RANK", SUMAPRODUCTO: "SUMPRODUCT", PAGO: "PMT", VF: "FV", VA: "PV", FILA: "ROW", COLUMNA: "COLUMN",
};

const stripAccents = (s: string) => s.replace(/[ÁÀ]/g, "A").replace(/[ÉÈ]/g, "E").replace(/[ÍÌ]/g, "I").replace(/[ÓÒ]/g, "O").replace(/[ÚÙÜ]/g, "U");

/** Nombre interno (en inglés) de una función escrita en inglés o en español. */
export function canonicalFn(name: string): string {
  const up = name.toUpperCase();
  return ES[up] ?? ES[stripAccents(up)] ?? up;
}

/* ------------------------------------------------------------------ */
/*  Análisis léxico                                                    */
/* ------------------------------------------------------------------ */

type TokType = "num" | "str" | "ref" | "fn" | "name" | "op" | "lp" | "rp" | "sep" | "bool" | "err" | "ws";

export interface Token {
  t: TokType;
  v: string;
  start: number;
  end: number;
  /** Para referencias: hoja (si la hay) y las dos esquinas */
  sheet?: string;
  ref?: RefPart[];
}

/** Una esquina de una referencia; fila o columna pueden faltar (A:A, 3:3). */
export interface RefPart {
  r: number | null;
  c: number | null;
  ar: boolean;
  ac: boolean;
}

const REF_RE = /^(?:('(?:[^']|'')+'|[A-Za-z_À-ɏ][\w.À-ɏ]*)!)?(\$?[A-Za-z]{1,3}\$?\d{1,7}(?::\$?[A-Za-z]{1,3}\$?\d{1,7})?|\$?[A-Za-z]{1,3}:\$?[A-Za-z]{1,3}|\$?\d{1,7}:\$?\d{1,7})(?![\w(.])/;

function parseRefPart(s: string): RefPart {
  const m = /^(\$?)([A-Za-z]{0,3})(\$?)(\d*)$/.exec(s)!;
  return {
    c: m[2] ? colIndex(m[2]) : null,
    ac: m[1] === "$" && !!m[2],
    r: m[4] ? Number(m[4]) - 1 : null,
    ar: (m[2] ? m[3] : m[1]) === "$" && !!m[4],
  };
}

export function tokenize(src: string): Token[] {
  const out: Token[] = [];
  const semicolons = src.replace(/"[^"]*"/g, "").includes(";");
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    const rest = src.slice(i);
    if (/\s/.test(ch)) {
      const m = /^\s+/.exec(rest)!;
      out.push({ t: "ws", v: m[0], start: i, end: i + m[0].length });
      i += m[0].length;
      continue;
    }
    if (ch === '"') {
      let j = i + 1;
      let s = "";
      while (j < src.length) {
        if (src[j] === '"') {
          if (src[j + 1] === '"') {
            s += '"';
            j += 2;
            continue;
          }
          break;
        }
        s += src[j++];
      }
      out.push({ t: "str", v: s, start: i, end: j + 1 });
      i = j + 1;
      continue;
    }
    if (ch === "#") {
      const m = /^#(DIV\/0!|N\/A|NAME\?|NUM!|REF!|VALUE!|NULL!)/i.exec(rest);
      if (m) {
        out.push({ t: "err", v: m[0].toUpperCase(), start: i, end: i + m[0].length });
        i += m[0].length;
        continue;
      }
    }
    // Con «;» como separador, la coma puede ser la de los decimales (1234,5)
    const num = (semicolons ? /^(\d+,\d+|\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i : /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i).exec(rest);
    // Un número no puede ser el principio de una fila completa (3:5)
    if (num && !/^\d+:\$?\d/.test(rest)) {
      out.push({ t: "num", v: num[0], start: i, end: i + num[0].length });
      i += num[0].length;
      continue;
    }
    const ref = REF_RE.exec(rest);
    if (ref) {
      let sheet = ref[1];
      if (sheet?.startsWith("'")) sheet = sheet.slice(1, -1).replace(/''/g, "'");
      const parts = ref[2].split(":").map(parseRefPart);
      out.push({ t: "ref", v: ref[0], start: i, end: i + ref[0].length, sheet, ref: parts });
      i += ref[0].length;
      continue;
    }
    const name = /^[A-Za-z_À-ɏ][\w.À-ɏ]*/.exec(rest);
    if (name) {
      const after = src.slice(i + name[0].length).trimStart();
      const up = name[0].toUpperCase();
      if (after.startsWith("(")) out.push({ t: "fn", v: name[0], start: i, end: i + name[0].length });
      else if (["TRUE", "FALSE", "VERDADERO", "FALSO"].includes(up)) out.push({ t: "bool", v: up === "TRUE" || up === "VERDADERO" ? "TRUE" : "FALSE", start: i, end: i + name[0].length });
      else out.push({ t: "name", v: name[0], start: i, end: i + name[0].length });
      i += name[0].length;
      continue;
    }
    const op = /^(<>|<=|>=|[-+*/^&=<>%])/.exec(rest);
    if (op) {
      out.push({ t: "op", v: op[0], start: i, end: i + op[0].length });
      i += op[0].length;
      continue;
    }
    if (ch === "(") out.push({ t: "lp", v: ch, start: i, end: i + 1 });
    else if (ch === ")") out.push({ t: "rp", v: ch, start: i, end: i + 1 });
    else if (ch === "," || ch === ";") out.push({ t: "sep", v: ch, start: i, end: i + 1 });
    else throw new SyntaxError(`Carácter no válido: ${ch}`);
    i++;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Análisis sintáctico                                                */
/* ------------------------------------------------------------------ */

export type Node =
  | { k: "num"; v: number }
  | { k: "str"; v: string }
  | { k: "bool"; v: boolean }
  | { k: "err"; v: string }
  | { k: "ref"; sheet?: string; a: RefPart; b?: RefPart }
  | { k: "fn"; name: string; args: Node[] }
  | { k: "bin"; op: string; a: Node; b: Node }
  | { k: "neg"; a: Node }
  | { k: "pct"; a: Node }
  | { k: "name"; v: string };

export function parse(src: string): Node {
  const toks = tokenize(src).filter((t) => t.t !== "ws");
  let p = 0;
  const peek = () => toks[p];
  const next = () => toks[p++];
  const expect = (t: TokType) => {
    const tok = next();
    if (!tok || tok.t !== t) throw new SyntaxError("Fórmula incompleta");
    return tok;
  };

  const PREC: Record<string, number> = { "=": 1, "<>": 1, "<": 1, ">": 1, "<=": 1, ">=": 1, "&": 2, "+": 3, "-": 3, "*": 4, "/": 4, "^": 5 };

  function expr(min = 1): Node {
    let left = unary();
    for (;;) {
      const tok = peek();
      if (!tok || tok.t !== "op" || !(tok.v in PREC) || PREC[tok.v] < min) break;
      next();
      const prec = PREC[tok.v];
      // ^ se asocia por la izquierda en Excel
      const right = expr(prec + 1);
      left = { k: "bin", op: tok.v, a: left, b: right };
    }
    return left;
  }

  function unary(): Node {
    const tok = peek();
    if (tok?.t === "op" && (tok.v === "-" || tok.v === "+")) {
      next();
      const a = unary();
      return tok.v === "-" ? { k: "neg", a } : a;
    }
    return postfix();
  }

  function postfix(): Node {
    let n = primary();
    while (peek()?.t === "op" && peek().v === "%") {
      next();
      n = { k: "pct", a: n };
    }
    return n;
  }

  function primary(): Node {
    const tok = next();
    if (!tok) throw new SyntaxError("Fórmula incompleta");
    switch (tok.t) {
      case "num":
        return { k: "num", v: Number(tok.v.replace(",", ".")) };
      case "str":
        return { k: "str", v: tok.v };
      case "bool":
        return { k: "bool", v: tok.v === "TRUE" };
      case "err":
        return { k: "err", v: tok.v };
      case "ref":
        return { k: "ref", sheet: tok.sheet, a: tok.ref![0], b: tok.ref![1] };
      case "name":
        return { k: "name", v: tok.v };
      case "lp": {
        const e = expr();
        expect("rp");
        return e;
      }
      case "fn": {
        expect("lp");
        const args: Node[] = [];
        if (peek()?.t === "rp") {
          next();
        } else {
          for (;;) {
            // Argumento vacío: SI(A1;;3)
            if (peek()?.t === "sep" || peek()?.t === "rp") args.push({ k: "str", v: "" });
            else args.push(expr());
            const t = next();
            if (!t) throw new SyntaxError("Falta cerrar el paréntesis");
            if (t.t === "rp") break;
            if (t.t !== "sep") throw new SyntaxError("Se esperaba «;»");
          }
        }
        return { k: "fn", name: canonicalFn(tok.v), args };
      }
      default:
        throw new SyntaxError("Fórmula no válida");
    }
  }

  const node = expr();
  if (p < toks.length) throw new SyntaxError("Sobra algo al final de la fórmula");
  return node;
}

const parseCache = new Map<string, Node | SyntaxError>();
function parseCached(src: string): Node | SyntaxError {
  let n = parseCache.get(src);
  if (!n) {
    try {
      n = parse(src);
    } catch (e) {
      n = e instanceof SyntaxError ? e : new SyntaxError(String(e));
    }
    if (parseCache.size > 5000) parseCache.clear();
    parseCache.set(src, n);
  }
  return n;
}

/** Comprueba la sintaxis; devuelve el mensaje de error o null. */
export function checkFormula(src: string): string | null {
  const n = parseCached(src);
  return n instanceof SyntaxError ? n.message : null;
}

/* ------------------------------------------------------------------ */
/*  Valores literales escritos en las celdas                           */
/* ------------------------------------------------------------------ */

/** Valor de lo escrito en una celda que no es fórmula. */
export function literal(v: string): Scalar {
  if (v === "") return null;
  const t = v.trim();
  if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return Number(t);
  const up = t.toUpperCase();
  if (up === "TRUE" || up === "VERDADERO") return true;
  if (up === "FALSE" || up === "FALSO") return false;
  return v;
}

/* ------------------------------------------------------------------ */
/*  Evaluación                                                         */
/* ------------------------------------------------------------------ */

const toNum = (v: Scalar): number | FErr => {
  if (v instanceof FErr) return v;
  if (v === null || v === "") return 0;
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) && v.trim() !== "" ? n : new FErr("#VALUE!");
};

const toStr = (v: Scalar): string => {
  if (v === null) return "";
  if (typeof v === "boolean") return v ? "VERDADERO" : "FALSO";
  if (typeof v === "number") return String(Math.round(v * 1e10) / 1e10).replace(".", ",");
  return String(v);
};

const toBool = (v: Scalar): boolean | FErr => {
  if (v instanceof FErr) return v;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (v === null || v === "") return false;
  const up = v.toUpperCase();
  if (up === "TRUE" || up === "VERDADERO") return true;
  if (up === "FALSE" || up === "FALSO") return false;
  return new FErr("#VALUE!");
};

/** Valor de una celda para una operación: si es un rango, su primer valor. */
const scalar = (v: Value): Scalar => (isMatrix(v) ? (v[0]?.[0] ?? null) : v);

function flat(args: Value[]): Scalar[] {
  const out: Scalar[] = [];
  for (const a of args) {
    if (isMatrix(a)) for (const row of a) for (const x of row) out.push(x);
    else out.push(a);
  }
  return out;
}

/** Números de los argumentos: en rangos solo cuentan los números; sueltos, se convierten. */
function nums(args: Value[]): number[] | FErr {
  const out: number[] = [];
  for (const a of args) {
    if (isMatrix(a)) {
      for (const row of a) for (const x of row) {
        if (x instanceof FErr) return x;
        if (typeof x === "number") out.push(x);
      }
    } else {
      if (a === null) continue;
      const n = toNum(a);
      if (n instanceof FErr) return n;
      out.push(n);
    }
  }
  return out;
}

function compare(a: Scalar, b: Scalar): number {
  if (a === null) a = typeof b === "string" ? "" : 0;
  if (b === null) b = typeof a === "string" ? "" : 0;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  // Como en Excel: números < textos < lógicos
  const rank = (x: Scalar) => (typeof x === "number" ? 0 : typeof x === "string" ? 1 : 2);
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  return String(a).localeCompare(String(b), "es", { sensitivity: "base" });
}

/** Criterio de SUMAR.SI / CONTAR.SI: ">5", "<>x", "a*"… */
function criterion(c: Scalar): (v: Scalar) => boolean {
  if (typeof c === "number" || typeof c === "boolean") return (v) => v === c || (typeof v === "string" && v === String(c));
  const s = toStr(c);
  const m = /^(<>|>=|<=|=|>|<)?(.*)$/.exec(s)!;
  const op = m[1] ?? "=";
  const raw = m[2];
  const n = raw.trim() !== "" && Number.isFinite(Number(raw.replace(",", "."))) ? Number(raw.replace(",", ".")) : null;
  if (n !== null && op !== "=" && op !== "<>") {
    return (v) => {
      if (typeof v !== "number") return false;
      return op === ">" ? v > n : op === "<" ? v < n : op === ">=" ? v >= n : v <= n;
    };
  }
  let test: (v: Scalar) => boolean;
  if (n !== null) test = (v) => (typeof v === "number" ? v === n : toStr(v) === raw);
  else if (/[*?]/.test(raw)) {
    const re = new RegExp("^" + raw.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$", "i");
    test = (v) => re.test(toStr(v));
  } else test = (v) => toStr(v).toLowerCase() === raw.toLowerCase();
  if (op === "<>") return (v) => !test(v);
  if (op === "=" || !m[1]) return test;
  return (v) => {
    const r = compare(v, raw);
    return op === ">" ? r > 0 : op === "<" ? r < 0 : op === ">=" ? r >= 0 : r <= 0;
  };
}

const roundTo = (n: number, d: number, mode: "round" | "up" | "down") => {
  const f = 10 ** d;
  const x = Math.abs(n) * f;
  const r = mode === "round" ? Math.round(x + 1e-9) : mode === "up" ? Math.ceil(x - 1e-9) : Math.floor(x + 1e-9);
  return (Math.sign(n) * r) / f;
};

function formatText(n: number, fmt: string): string {
  // TEXTO(valor; "0,00"), "0%", "dd/mm/aaaa"… Lo esencial.
  const f = fmt.toLowerCase();
  if (/[dmy]|aa/.test(f) && !/^[#0.,%]+$/.test(f)) {
    const d = serialToDate(n);
    const pad = (x: number) => String(x).padStart(2, "0");
    return f
      .replace(/yyyy|aaaa/g, String(d.getUTCFullYear()))
      .replace(/yy|aa/g, String(d.getUTCFullYear()).slice(2))
      .replace(/dd/g, pad(d.getUTCDate()))
      .replace(/mm/g, pad(d.getUTCMonth() + 1))
      .replace(/(?<![a-z])d(?![a-z])/g, String(d.getUTCDate()))
      .replace(/(?<![a-z])m(?![a-z])/g, String(d.getUTCMonth() + 1));
  }
  const pct = f.includes("%");
  const v = pct ? n * 100 : n;
  const dec = (/[.,](0+)/.exec(f)?.[1] ?? "").length;
  const grouping = /#[.,]##/.test(f) || /0[.,]000/.test(f);
  return v.toLocaleString("es-ES", { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: grouping }) + (pct ? "%" : "");
}

type Fn = (args: Node[], ev: (n: Node) => Value, ctx: EvalCtx) => Value;

interface EvalCtx {
  sheet: number;
  row: number;
  col: number;
}

/** Funciones que reciben los argumentos ya calculados. */
const simple = (f: (a: Value[]) => Value): Fn => (args, ev) => f(args.map(ev));

const numFn = (f: (...n: number[]) => number | FErr, arity?: number): Fn =>
  simple((a) => {
    if (arity !== undefined && a.length < arity) return new FErr("#VALUE!");
    const ns: number[] = [];
    for (const x of a) {
      const n = toNum(scalar(x));
      if (n instanceof FErr) return n;
      ns.push(n);
    }
    const r = f(...ns);
    return typeof r === "number" && !Number.isFinite(r) ? new FErr("#NUM!") : r;
  });

const agg = (f: (ns: number[]) => number | FErr): Fn =>
  simple((a) => {
    const ns = nums(a);
    return ns instanceof FErr ? ns : f(ns);
  });

const mean = (ns: number[]) => (ns.length ? ns.reduce((x, y) => x + y, 0) / ns.length : new FErr("#DIV/0!"));
const variance = (ns: number[]) => {
  if (ns.length < 2) return new FErr("#DIV/0!");
  const m = ns.reduce((x, y) => x + y, 0) / ns.length;
  return ns.reduce((s, x) => s + (x - m) ** 2, 0) / (ns.length - 1);
};

function lookupIndex(needle: Scalar, list: Scalar[], exact: boolean): number {
  if (exact) {
    const crit = typeof needle === "string" && /[*?]/.test(needle) ? criterion(needle) : null;
    return list.findIndex((x) => (crit ? crit(x) : compare(x, needle) === 0 && typeof x === typeof needle) || (typeof x === "string" && typeof needle === "string" && x.toLowerCase() === needle.toLowerCase()));
  }
  // Coincidencia aproximada: el mayor valor que sea menor o igual (lista ordenada)
  let best = -1;
  for (let i = 0; i < list.length; i++) {
    if (list[i] === null) continue;
    if (compare(list[i], needle) <= 0) best = i;
    else break;
  }
  return best;
}

/** Números del primer rango cuyas filas cumplen todos los criterios (…SI.CONJUNTO). */
function ifsValues(a: Value[]): number[] | FErr {
  const vals = isMatrix(a[0]) ? a[0] : [[a[0]]];
  const out: number[] = [];
  vals.forEach((row, r) => row.forEach((v, c) => {
    for (let i = 1; i + 1 < a.length; i += 2) {
      const rg = a[i];
      const x = isMatrix(rg) ? rg[r]?.[c] : rg;
      if (!criterion(scalar(a[i + 1]))(x ?? null)) return;
    }
    if (typeof v === "number") out.push(v);
  }));
  return out;
}

const FUNCS: Record<string, Fn> = {
  SUM: agg((ns) => ns.reduce((a, b) => a + b, 0)),
  AVERAGE: agg(mean),
  MIN: agg((ns) => (ns.length ? Math.min(...ns) : 0)),
  MAX: agg((ns) => (ns.length ? Math.max(...ns) : 0)),
  PRODUCT: agg((ns) => ns.reduce((a, b) => a * b, 1)),
  MEDIAN: agg((ns) => {
    if (!ns.length) return new FErr("#NUM!");
    const s = [...ns].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }),
  MODE: agg((ns) => {
    const counts = new Map<number, number>();
    let best: number | null = null;
    let bestN = 1;
    for (const n of ns) {
      const c = (counts.get(n) ?? 0) + 1;
      counts.set(n, c);
      if (c > bestN) {
        bestN = c;
        best = n;
      }
    }
    return best ?? new FErr("#N/A");
  }),
  STDEV: agg((ns) => {
    const v = variance(ns);
    return v instanceof FErr ? v : Math.sqrt(v);
  }),
  VAR: agg(variance),
  COUNT: simple((a) => flat(a).filter((x) => typeof x === "number").length),
  COUNTA: simple((a) => flat(a).filter((x) => x !== null && x !== "").length),
  COUNTBLANK: simple((a) => flat(a).filter((x) => x === null || x === "").length),
  LARGE: simple((a) => {
    const ns = nums([a[0]]);
    const k = toNum(scalar(a[1]));
    if (ns instanceof FErr) return ns;
    if (k instanceof FErr) return k;
    const s = [...ns].sort((x, y) => y - x);
    return s[k - 1] ?? new FErr("#NUM!");
  }),
  SMALL: simple((a) => {
    const ns = nums([a[0]]);
    const k = toNum(scalar(a[1]));
    if (ns instanceof FErr) return ns;
    if (k instanceof FErr) return k;
    const s = [...ns].sort((x, y) => x - y);
    return s[k - 1] ?? new FErr("#NUM!");
  }),
  RANK: simple((a) => {
    const n = toNum(scalar(a[0]));
    const ns = nums([a[1]]);
    if (n instanceof FErr) return n;
    if (ns instanceof FErr) return ns;
    const asc = a[2] !== undefined && toNum(scalar(a[2])) === 1;
    if (!ns.includes(n)) return new FErr("#N/A");
    return ns.filter((x) => (asc ? x < n : x > n)).length + 1;
  }),
  SUMPRODUCT: simple((a) => {
    if (!a.every(isMatrix)) return new FErr("#VALUE!");
    const ms = a as Matrix[];
    const rows = ms[0].length;
    const cols = ms[0][0]?.length ?? 0;
    if (ms.some((m) => m.length !== rows || (m[0]?.length ?? 0) !== cols)) return new FErr("#VALUE!");
    let sum = 0;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) sum += ms.reduce((p, m) => p * (typeof m[r][c] === "number" ? (m[r][c] as number) : 0), 1);
    return sum;
  }),

  ROUND: numFn((n, d = 0) => roundTo(n, d, "round")),
  ROUNDUP: numFn((n, d = 0) => roundTo(n, d, "up")),
  ROUNDDOWN: numFn((n, d = 0) => roundTo(n, d, "down")),
  TRUNC: numFn((n, d = 0) => roundTo(n, d, "down")),
  INT: numFn((n) => Math.floor(n)),
  ABS: numFn((n) => Math.abs(n)),
  SIGN: numFn((n) => Math.sign(n)),
  MOD: numFn((n, d) => (d === 0 ? new FErr("#DIV/0!") : n - d * Math.floor(n / d)), 2),
  POWER: numFn((n, p) => n ** p, 2),
  SQRT: numFn((n) => (n < 0 ? new FErr("#NUM!") : Math.sqrt(n))),
  EXP: numFn((n) => Math.exp(n)),
  LN: numFn((n) => (n <= 0 ? new FErr("#NUM!") : Math.log(n))),
  LOG10: numFn((n) => (n <= 0 ? new FErr("#NUM!") : Math.log10(n))),
  LOG: numFn((n, b = 10) => (n <= 0 ? new FErr("#NUM!") : Math.log(n) / Math.log(b))),
  PI: () => Math.PI,
  RAND: () => Math.random(),
  RANDBETWEEN: numFn((a, b) => Math.floor(a + Math.random() * (b - a + 1)), 2),
  CEILING: numFn((n, s = 1) => (s === 0 ? 0 : Math.ceil(n / s - 1e-12) * s)),
  FLOOR: numFn((n, s = 1) => (s === 0 ? 0 : Math.floor(n / s + 1e-12) * s)),

  IF: (args, ev) => {
    const c = toBool(scalar(ev(args[0])));
    if (c instanceof FErr) return c;
    if (c) return args[1] ? ev(args[1]) : true;
    return args[2] ? ev(args[2]) : false;
  },
  IFS: (args, ev) => {
    for (let i = 0; i + 1 < args.length; i += 2) {
      const c = toBool(scalar(ev(args[i])));
      if (c instanceof FErr) return c;
      if (c) return ev(args[i + 1]);
    }
    return new FErr("#N/A");
  },
  IFERROR: (args, ev) => {
    const v = ev(args[0]);
    return scalar(v) instanceof FErr ? (args[1] ? ev(args[1]) : "") : v;
  },
  IFNA: (args, ev) => {
    const v = ev(args[0]);
    const s = scalar(v);
    return s instanceof FErr && s.code === "#N/A" ? ev(args[1]) : v;
  },
  AND: simple((a) => {
    for (const x of flat(a)) {
      if (x === null) continue;
      const b = toBool(x);
      if (b instanceof FErr) return b;
      if (!b) return false;
    }
    return true;
  }),
  OR: simple((a) => {
    for (const x of flat(a)) {
      if (x === null) continue;
      const b = toBool(x);
      if (b instanceof FErr) return b;
      if (b) return true;
    }
    return false;
  }),
  XOR: simple((a) => flat(a).filter((x) => x !== null && toBool(x) === true).length % 2 === 1),
  NOT: simple((a) => {
    const b = toBool(scalar(a[0]));
    return b instanceof FErr ? b : !b;
  }),
  TRUE: () => true,
  FALSE: () => false,
  ISBLANK: simple((a) => scalar(a[0]) === null),
  ISNUMBER: simple((a) => typeof scalar(a[0]) === "number"),
  ISTEXT: simple((a) => typeof scalar(a[0]) === "string"),
  ISERROR: simple((a) => scalar(a[0]) instanceof FErr),

  CONCAT: simple((a) => flat(a).map(toStr).join("")),
  CONCATENATE: simple((a) => flat(a).map(toStr).join("")),
  TEXTJOIN: simple((a) => {
    const sep = toStr(scalar(a[0]));
    const skip = toBool(scalar(a[1])) === true;
    return flat(a.slice(2))
      .map(toStr)
      .filter((s) => !skip || s !== "")
      .join(sep);
  }),
  LEN: simple((a) => toStr(scalar(a[0])).length),
  UPPER: simple((a) => toStr(scalar(a[0])).toUpperCase()),
  LOWER: simple((a) => toStr(scalar(a[0])).toLowerCase()),
  PROPER: simple((a) => toStr(scalar(a[0])).toLowerCase().replace(/(^|[^\p{L}])(\p{L})/gu, (_, p, l: string) => p + l.toUpperCase())),
  TRIM: simple((a) => toStr(scalar(a[0])).trim().replace(/\s+/g, " ")),
  LEFT: simple((a) => toStr(scalar(a[0])).slice(0, a[1] === undefined ? 1 : Number(toNum(scalar(a[1]))))),
  RIGHT: simple((a) => {
    const s = toStr(scalar(a[0]));
    const n = a[1] === undefined ? 1 : Number(toNum(scalar(a[1])));
    return n <= 0 ? "" : s.slice(-n);
  }),
  MID: simple((a) => {
    const s = toStr(scalar(a[0]));
    const st = Number(toNum(scalar(a[1])));
    const n = Number(toNum(scalar(a[2])));
    return s.substr(st - 1, n);
  }),
  FIND: simple((a) => {
    const i = toStr(scalar(a[1])).indexOf(toStr(scalar(a[0])), a[2] === undefined ? 0 : Number(toNum(scalar(a[2]))) - 1);
    return i < 0 ? new FErr("#VALUE!") : i + 1;
  }),
  SEARCH: simple((a) => {
    const i = toStr(scalar(a[1])).toLowerCase().indexOf(toStr(scalar(a[0])).toLowerCase(), a[2] === undefined ? 0 : Number(toNum(scalar(a[2]))) - 1);
    return i < 0 ? new FErr("#VALUE!") : i + 1;
  }),
  SUBSTITUTE: simple((a) => toStr(scalar(a[0])).split(toStr(scalar(a[1]))).join(toStr(scalar(a[2])))),
  REPLACE: simple((a) => {
    const s = toStr(scalar(a[0]));
    const st = Number(toNum(scalar(a[1]))) - 1;
    const n = Number(toNum(scalar(a[2])));
    return s.slice(0, st) + toStr(scalar(a[3])) + s.slice(st + n);
  }),
  REPT: simple((a) => toStr(scalar(a[0])).repeat(Math.max(0, Number(toNum(scalar(a[1])))))),
  TEXT: simple((a) => {
    const n = toNum(scalar(a[0]));
    return n instanceof FErr ? toStr(scalar(a[0])) : formatText(n, toStr(scalar(a[1])));
  }),
  VALUE: simple((a) => toNum(scalar(a[0]))),
  EXACT: simple((a) => toStr(scalar(a[0])) === toStr(scalar(a[1]))),

  TODAY: () => Math.floor(nowSerial()),
  NOW: () => nowSerial(),
  DATE: numFn((y, m, d) => dateToSerial(y, m, d), 3),
  YEAR: numFn((n) => serialToDate(n).getUTCFullYear()),
  MONTH: numFn((n) => serialToDate(n).getUTCMonth() + 1),
  DAY: numFn((n) => serialToDate(n).getUTCDate()),
  WEEKDAY: numFn((n, type = 1) => {
    const d = serialToDate(n).getUTCDay();
    return type === 2 ? ((d + 6) % 7) + 1 : type === 3 ? (d + 6) % 7 : d + 1;
  }),
  HOUR: numFn((n) => Math.floor(((n % 1) * 24) + 1e-9)),
  MINUTE: numFn((n) => Math.floor(((n * 1440) % 60) + 1e-9)),
  DAYS: numFn((a, b) => Math.floor(a) - Math.floor(b), 2),
  EDATE: numFn((n, m) => {
    const d = serialToDate(n);
    return dateToSerial(d.getUTCFullYear(), d.getUTCMonth() + 1 + m, d.getUTCDate());
  }, 2),
  EOMONTH: numFn((n, m) => {
    const d = serialToDate(n);
    return dateToSerial(d.getUTCFullYear(), d.getUTCMonth() + 2 + m, 0);
  }, 2),

  SUMIF: simple((a) => {
    const range = isMatrix(a[0]) ? a[0] : [[a[0]]];
    const test = criterion(scalar(a[1]));
    const sum = a[2] !== undefined ? (isMatrix(a[2]) ? a[2] : [[a[2]]]) : range;
    let s = 0;
    range.forEach((row, r) => row.forEach((x, c) => {
      const v = sum[r]?.[c];
      if (test(x) && typeof v === "number") s += v;
    }));
    return s;
  }),
  AVERAGEIF: simple((a) => {
    const range = isMatrix(a[0]) ? a[0] : [[a[0]]];
    const test = criterion(scalar(a[1]));
    const avg = a[2] !== undefined ? (isMatrix(a[2]) ? a[2] : [[a[2]]]) : range;
    const ns: number[] = [];
    range.forEach((row, r) => row.forEach((x, c) => {
      const v = avg[r]?.[c];
      if (test(x) && typeof v === "number") ns.push(v);
    }));
    return mean(ns);
  }),
  COUNTIF: simple((a) => {
    const test = criterion(scalar(a[1]));
    return flat([a[0]]).filter(test).length;
  }),
  SUMIFS: simple((a) => {
    const sum = isMatrix(a[0]) ? a[0] : [[a[0]]];
    let s = 0;
    sum.forEach((row, r) => row.forEach((v, c) => {
      for (let i = 1; i + 1 < a.length; i += 2) {
        const rg = a[i];
        const x = isMatrix(rg) ? rg[r]?.[c] : rg;
        if (!criterion(scalar(a[i + 1]))(x ?? null)) return;
      }
      if (typeof v === "number") s += v;
    }));
    return s;
  }),
  AVERAGEIFS: simple((a) => {
    const v = ifsValues(a);
    return v instanceof FErr ? v : mean(v);
  }),
  MAXIFS: simple((a) => {
    const v = ifsValues(a);
    return v instanceof FErr ? v : v.length ? Math.max(...v) : 0;
  }),
  MINIFS: simple((a) => {
    const v = ifsValues(a);
    return v instanceof FErr ? v : v.length ? Math.min(...v) : 0;
  }),
  COUNTIFS: simple((a) => {
    const first = isMatrix(a[0]) ? a[0] : [[a[0]]];
    let n = 0;
    first.forEach((row, r) => row.forEach((_, c) => {
      for (let i = 0; i + 1 < a.length; i += 2) {
        const rg = a[i];
        const x = isMatrix(rg) ? rg[r]?.[c] : rg;
        if (!criterion(scalar(a[i + 1]))(x ?? null)) return;
      }
      n++;
    }));
    return n;
  }),

  VLOOKUP: simple((a) => {
    const needle = scalar(a[0]);
    const table = a[1];
    if (!isMatrix(table)) return new FErr("#VALUE!");
    const col = Number(toNum(scalar(a[2])));
    if (!(col >= 1 && col <= (table[0]?.length ?? 0))) return new FErr("#REF!");
    const exact = a[3] !== undefined && toBool(scalar(a[3])) === false;
    const i = lookupIndex(needle, table.map((r) => r[0]), exact);
    return i < 0 ? new FErr("#N/A") : table[i][col - 1];
  }),
  HLOOKUP: simple((a) => {
    const needle = scalar(a[0]);
    const table = a[1];
    if (!isMatrix(table)) return new FErr("#VALUE!");
    const row = Number(toNum(scalar(a[2])));
    if (!(row >= 1 && row <= table.length)) return new FErr("#REF!");
    const exact = a[3] !== undefined && toBool(scalar(a[3])) === false;
    const i = lookupIndex(needle, table[0], exact);
    return i < 0 ? new FErr("#N/A") : table[row - 1][i];
  }),
  MATCH: simple((a) => {
    const list = flat([a[1]]);
    const type = a[2] === undefined ? 1 : Number(toNum(scalar(a[2])));
    const i = lookupIndex(scalar(a[0]), list, type === 0);
    return i < 0 ? new FErr("#N/A") : i + 1;
  }),
  INDEX: simple((a) => {
    const m = isMatrix(a[0]) ? a[0] : [[a[0]]];
    let r = Number(toNum(scalar(a[1] ?? 1)));
    let c = a[2] === undefined ? 1 : Number(toNum(scalar(a[2])));
    // Con una sola fila, el segundo argumento es la columna
    if (m.length === 1 && a[2] === undefined) [r, c] = [1, r];
    return m[r - 1]?.[c - 1] ?? new FErr("#REF!");
  }),
  XLOOKUP: simple((a) => {
    const look = flat([a[1]]);
    const ret = a[2];
    const i = lookupIndex(scalar(a[0]), look, true);
    if (i < 0) return a[3] !== undefined ? a[3] : new FErr("#N/A");
    if (!isMatrix(ret)) return ret;
    return ret.length === 1 ? ret[0][i] : (ret[i]?.[0] ?? new FErr("#REF!"));
  }),
  CHOOSE: (args, ev) => {
    const i = toNum(scalar(ev(args[0])));
    if (i instanceof FErr) return i;
    return args[i] ? ev(args[i]) : new FErr("#VALUE!");
  },
  ROWS: simple((a) => (isMatrix(a[0]) ? a[0].length : 1)),
  COLUMNS: simple((a) => (isMatrix(a[0]) ? (a[0][0]?.length ?? 0) : 1)),
  ROW: (args, _ev, ctx) => (args[0]?.k === "ref" ? (args[0].a.r ?? 0) + 1 : ctx.row + 1),
  COLUMN: (args, _ev, ctx) => (args[0]?.k === "ref" ? (args[0].a.c ?? 0) + 1 : ctx.col + 1),

  PMT: numFn((rate, n, pv, fv = 0, type = 0) => {
    if (rate === 0) return -(pv + fv) / n;
    const f = (1 + rate) ** n;
    return (-(pv * f + fv) * rate) / ((1 + rate * type) * (f - 1));
  }),
  FV: numFn((rate, n, pmt, pv = 0, type = 0) => {
    if (rate === 0) return -(pv + pmt * n);
    const f = (1 + rate) ** n;
    return -(pv * f + (pmt * (1 + rate * type) * (f - 1)) / rate);
  }),
  PV: numFn((rate, n, pmt, fv = 0, type = 0) => {
    if (rate === 0) return -(fv + pmt * n);
    const f = (1 + rate) ** n;
    return -(fv + (pmt * (1 + rate * type) * (f - 1)) / rate) / f;
  }),
};

/** Lista de funciones disponibles (para el asistente de funciones). */
export const FUNCTION_NAMES = Object.keys(FUNCS);

/** Nombre en español de una función (para mostrarla), si lo tiene. */
export function spanishName(fn: string): string {
  for (const [es, en] of Object.entries(ES)) if (en === fn && es !== "ANO" && !es.includes("DESVEST.M") && es !== "JERARQUIA.EQV") return es;
  return fn;
}

/* ------------------------------------------------------------------ */
/*  Evaluador de un libro                                              */
/* ------------------------------------------------------------------ */

export class Evaluator {
  private memo = new Map<string, Scalar>();
  private visiting = new Set<string>();
  private byName = new Map<string, number>();

  constructor(private wb: Workbook) {
    wb.sheets.forEach((s, i) => this.byName.set(s.name.toLowerCase(), i));
  }

  /** Valor calculado de una celda. */
  value(sheet: number, r: number, c: number): Scalar {
    const k = `${sheet}:${r},${c}`;
    const m = this.memo.get(k);
    if (m !== undefined) return m;
    const cell = this.wb.sheets[sheet]?.cells[`${r},${c}`];
    if (!cell || cell.v === "") {
      this.memo.set(k, null);
      return null;
    }
    if (!cell.v.startsWith("=") || cell.v.length < 2 || cell.s?.fmt === "text") {
      const v = cell.s?.fmt === "text" ? cell.v : literal(cell.v);
      this.memo.set(k, v);
      return v;
    }
    if (this.visiting.has(k)) return new FErr("#CIRC!");
    this.visiting.add(k);
    let out: Scalar;
    const node = parseCached(cell.v.slice(1));
    if (node instanceof SyntaxError) out = new FErr("#ERROR!");
    else {
      try {
        out = scalar(this.eval(node, { sheet, row: r, col: c }));
      } catch {
        out = new FErr("#ERROR!");
      }
    }
    // Un resultado -0 o con ruido de coma flotante se limpia
    if (typeof out === "number") out = Math.abs(out) < 1e-12 ? 0 : Number(out.toPrecision(15));
    this.visiting.delete(k);
    this.memo.set(k, out);
    return out;
  }

  /** Calcula una fórmula suelta (sin «=») en el contexto de una hoja. */
  evaluate(src: string, sheet: number): Value {
    const node = parseCached(src);
    if (node instanceof SyntaxError) return new FErr("#ERROR!");
    return this.eval(node, { sheet, row: 0, col: 0 });
  }

  private sheetIndex(name: string | undefined, ctx: EvalCtx): number {
    if (!name) return ctx.sheet;
    return this.byName.get(name.toLowerCase()) ?? -1;
  }

  private rangeValues(si: number, a: RefPart, b: RefPart | undefined): Value {
    const s: Sheet | undefined = this.wb.sheets[si];
    if (!s) return new FErr("#REF!");
    if (!b) {
      if (a.r === null || a.c === null) return new FErr("#REF!");
      return this.value(si, a.r, a.c);
    }
    let r1 = a.r ?? 0;
    let r2 = b.r ?? -1;
    let c1 = a.c ?? 0;
    let c2 = b.c ?? -1;
    // Columnas o filas completas: hasta lo ocupado
    if (a.r === null || b.r === null || a.c === null || b.c === null) {
      let maxR = 0;
      let maxC = 0;
      for (const k in s.cells) {
        const [r, c] = parseKey(k);
        if (r > maxR) maxR = r;
        if (c > maxC) maxC = c;
      }
      if (a.r === null || b.r === null) {
        r1 = 0;
        r2 = maxR;
      }
      if (a.c === null || b.c === null) {
        c1 = 0;
        c2 = maxC;
      }
    }
    if (r1 > r2) [r1, r2] = [r2, r1];
    if (c1 > c2) [c1, c2] = [c2, c1];
    const out: Matrix = [];
    for (let r = r1; r <= r2; r++) {
      const row: Scalar[] = [];
      for (let c = c1; c <= c2; c++) row.push(this.value(si, r, c));
      out.push(row);
    }
    return out;
  }

  private eval(n: Node, ctx: EvalCtx): Value {
    switch (n.k) {
      case "num":
        return n.v;
      case "str":
        return n.v;
      case "bool":
        return n.v;
      case "err":
        return new FErr(n.v as FErr["code"]);
      case "name":
        return new FErr("#NAME?");
      case "ref": {
        const si = this.sheetIndex(n.sheet, ctx);
        if (si < 0) return new FErr("#REF!");
        return this.rangeValues(si, n.a, n.b);
      }
      case "neg": {
        const v = toNum(scalar(this.eval(n.a, ctx)));
        return v instanceof FErr ? v : -v;
      }
      case "pct": {
        const v = toNum(scalar(this.eval(n.a, ctx)));
        return v instanceof FErr ? v : v / 100;
      }
      case "fn": {
        const f = FUNCS[n.name];
        if (!f) return new FErr("#NAME?");
        const v = f(n.args, (x) => this.eval(x, ctx), ctx);
        return v;
      }
      case "bin": {
        const a = scalar(this.eval(n.a, ctx));
        const b = scalar(this.eval(n.b, ctx));
        if (a instanceof FErr) return a;
        if (b instanceof FErr) return b;
        switch (n.op) {
          case "&":
            return toStr(a) + toStr(b);
          case "=":
            return compare(a, b) === 0;
          case "<>":
            return compare(a, b) !== 0;
          case "<":
            return compare(a, b) < 0;
          case ">":
            return compare(a, b) > 0;
          case "<=":
            return compare(a, b) <= 0;
          case ">=":
            return compare(a, b) >= 0;
        }
        const x = toNum(a);
        const y = toNum(b);
        if (x instanceof FErr) return x;
        if (y instanceof FErr) return y;
        switch (n.op) {
          case "+":
            return x + y;
          case "-":
            return x - y;
          case "*":
            return x * y;
          case "/":
            return y === 0 ? new FErr("#DIV/0!") : x / y;
          case "^": {
            const r = x ** y;
            return Number.isFinite(r) ? r : new FErr("#NUM!");
          }
        }
        return new FErr("#ERROR!");
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Reescritura de referencias                                         */
/* ------------------------------------------------------------------ */

function refPartText(p: RefPart): string {
  return (p.c !== null ? (p.ac ? "$" : "") + colName(p.c) : "") + (p.r !== null ? (p.ar ? "$" : "") + (p.r + 1) : "");
}

function sheetPrefix(name: string | undefined): string {
  if (!name) return "";
  return /^[A-Za-z_À-ɏ][\w.À-ɏ]*$/.test(name) ? `${name}!` : `'${name.replace(/'/g, "''")}'!`;
}

/** Reescribe cada referencia de una fórmula (sin el «=»). `fn` devuelve null para dejarla como #REF!. */
function mapRefs(src: string, fn: (tok: Token) => RefPart[] | null): string {
  let toks: Token[];
  try {
    toks = tokenize(src);
  } catch {
    return src;
  }
  let out = "";
  for (const t of toks) {
    if (t.t !== "ref") {
      out += src.slice(t.start, t.end);
      continue;
    }
    const parts = fn(t);
    out += parts ? sheetPrefix(t.sheet) + parts.map(refPartText).join(":") : "#REF!";
  }
  return out;
}

/** Al copiar una fórmula, sus referencias relativas se desplazan. */
export function shiftFormula(v: string, dr: number, dc: number): string {
  if (!v.startsWith("=") || (dr === 0 && dc === 0)) return v;
  const body = mapRefs(v.slice(1), (t) => {
    const parts = t.ref!.map((p) => ({
      ...p,
      r: p.r === null || p.ar ? p.r : p.r + dr,
      c: p.c === null || p.ac ? p.c : p.c + dc,
    }));
    return parts.some((p) => (p.r !== null && p.r < 0) || (p.c !== null && p.c < 0)) ? null : parts;
  });
  return "=" + body;
}

/**
 * Ajusta las referencias al insertar (count > 0) o eliminar (count < 0) filas o columnas
 * en la hoja `target`. `own` indica si la fórmula está en esa misma hoja.
 */
export function adjustForInsert(v: string, target: string, own: boolean, axis: "row" | "col", at: number, count: number): string {
  if (!v.startsWith("=")) return v;
  return (
    "=" +
    mapRefs(v.slice(1), (t) => {
      const same = t.sheet ? t.sheet.toLowerCase() === target.toLowerCase() : own;
      if (!same) return t.ref!;
      const k = axis === "row" ? "r" : "c";
      const parts = t.ref!.map((p) => ({ ...p }));
      if (count > 0) {
        for (const p of parts) if (p[k] !== null && p[k]! >= at) p[k] = p[k]! + count;
        return parts;
      }
      const del = -count;
      const end = at + del - 1;
      if (parts.length === 1) {
        const x = parts[0][k];
        if (x === null) return parts;
        if (x >= at && x <= end) return null;
        if (x > end) parts[0][k] = x - del;
        return parts;
      }
      // Rango: se encoge
      let [a, b] = [parts[0][k], parts[1][k]];
      if (a === null || b === null) return parts;
      if (a > b) [a, b] = [b, a];
      if (a >= at && b <= end) return null;
      const na = a > end ? a - del : a >= at ? at : a;
      const nb = b > end ? b - del : b >= at ? at - 1 : b;
      parts[0][k] = na;
      parts[1][k] = nb;
      return parts;
    })
  );
}

/** Cambia el nombre de una hoja en las referencias que la usan. */
export function renameSheetRefs(v: string, from: string, to: string): string {
  if (!v.startsWith("=")) return v;
  let toks: Token[];
  try {
    toks = tokenize(v.slice(1));
  } catch {
    return v;
  }
  const src = v.slice(1);
  let out = "";
  for (const t of toks) {
    if (t.t === "ref" && t.sheet?.toLowerCase() === from.toLowerCase()) {
      out += sheetPrefix(to) + t.ref!.map(refPartText).join(":");
    } else out += src.slice(t.start, t.end);
  }
  return "=" + out;
}

/** Fórmula en el formato de Excel (nombres en inglés, separador «,»). */
export function toExcelFormula(v: string): string {
  const src = v.startsWith("=") ? v.slice(1) : v;
  let toks: Token[];
  try {
    toks = tokenize(src);
  } catch {
    return src;
  }
  return toks
    .map((t) => (t.t === "fn" ? canonicalFn(t.v) : t.t === "sep" ? "," : t.t === "num" ? t.v.replace(",", ".") : src.slice(t.start, t.end)))
    .join("");
}

/** Celdas a las que hace referencia una fórmula (para colorearlas al editar). */
export function formulaRefs(v: string): { sheet?: string; r1: number; c1: number; r2: number; c2: number; start: number; end: number }[] {
  if (!v.startsWith("=")) return [];
  let toks: Token[];
  try {
    toks = tokenize(v.slice(1));
  } catch {
    return [];
  }
  return toks
    .filter((t) => t.t === "ref" && t.ref!.every((p) => p.r !== null && p.c !== null))
    .map((t) => {
      const [a, b = a] = t.ref!;
      return {
        sheet: t.sheet,
        r1: Math.min(a.r!, b.r!),
        c1: Math.min(a.c!, b.c!),
        r2: Math.max(a.r!, b.r!),
        c2: Math.max(a.c!, b.c!),
        start: t.start + 1,
        end: t.end + 1,
      };
    });
}
