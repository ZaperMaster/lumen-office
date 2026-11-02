/*
 * Idiomas de la interfaz.
 *
 * El texto en español está escrito en el código y sirve de clave: L("Guardar")
 * devuelve la traducción del idioma elegido o, si falta, el texto original.
 * Los marcadores {0}, {1}… se rellenan con los demás argumentos.
 *
 * Solo el español viene con la app. Los demás idiomas se descargan de la web
 * la primera vez que se eligen y se guardan en el equipo (así la app ocupa menos).
 * Al cambiar de idioma la app se recarga, así que L() no necesita avisar a React.
 */

export interface Language {
  code: string;
  /** Nombre en su propio idioma */
  name: string;
  /** Formato de fechas y números de la interfaz */
  locale: string;
  /** Tamaño aproximado del paquete (KB) */
  size?: number;
}

const BASE: Language = { code: "es", name: "Español", locale: "es-ES" };
/** Lista que se usa si no se puede consultar la web */
const KNOWN: Language[] = [BASE, { code: "en", name: "English", locale: "en-US" }];

const PACK_URL = "https://zapermaster.github.io/lumen-office/lang/";
const CHOICE_KEY = "lumen.lang";
const packKey = (code: string) => `lumen.lang.pack.${code}`;

interface Pack {
  code: string;
  /** Versión de la app con la que se descargó */
  version: string;
  strings: Record<string, string>;
}

let dict: Record<string, string> = {};
let current: Language = BASE;

/** Traduce un texto de la interfaz. */
export function L(text: string, ...args: unknown[]): string {
  const s = dict[text] || text;
  return args.length ? s.replace(/\{(\d+)\}/g, (m, i: string) => (Number(i) < args.length ? String(args[Number(i)]) : m)) : s;
}

export const uiLanguage = (): Language => current;
/** Formato regional de la interfaz («es-ES», «en-US»…) */
export const uiLocale = (): string => current.locale;

const read = <T,>(key: string): T | null => {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
};

/** ¿Ya se eligió idioma? (si no, el inicio lo pregunta) */
export function languageChosen(): boolean {
  try {
    return localStorage.getItem(CHOICE_KEY) !== null;
  } catch {
    return true;
  }
}

/** Idiomas ya descargados en este equipo (además del español). */
export function installedLanguages(): string[] {
  const out: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith("lumen.lang.pack.")) out.push(k.slice("lumen.lang.pack.".length));
    }
  } catch {
    // Sin almacenamiento: solo español
  }
  return out;
}

/** Idiomas disponibles (los publica la web; sin conexión, los conocidos). */
export async function availableLanguages(): Promise<Language[]> {
  try {
    const res = await fetch(`${PACK_URL}index.json?v=${__APP_VERSION__}`, { cache: "no-cache" });
    if (!res.ok) throw new Error(String(res.status));
    const list = ((await res.json()) as { languages: Language[] }).languages.filter((l) => l.code && l.name && l.locale);
    return [BASE, ...list.filter((l) => l.code !== BASE.code)];
  } catch {
    const known = new Set(KNOWN.map((l) => l.code));
    return [...KNOWN, ...installedLanguages().filter((c) => !known.has(c)).map((c) => ({ code: c, name: c, locale: c }))];
  }
}

/** Descarga (o actualiza) el paquete de un idioma y lo guarda en el equipo. */
export async function downloadLanguage(lang: Language): Promise<void> {
  const res = await fetch(`${PACK_URL}${lang.code}.json?v=${__APP_VERSION__}`, { cache: "no-cache" });
  if (!res.ok) throw new Error(L("No se pudo descargar el idioma ({0}).", res.status));
  const strings = (await res.json()) as Record<string, string>;
  if (!strings || typeof strings !== "object") throw new Error(L("El paquete del idioma está dañado."));
  const pack: Pack & { name: string; locale: string } = { code: lang.code, name: lang.name, locale: lang.locale, version: __APP_VERSION__, strings };
  localStorage.setItem(packKey(lang.code), JSON.stringify(pack));
}

/** Borra un idioma descargado. */
export function removeLanguage(code: string) {
  try {
    localStorage.removeItem(packKey(code));
  } catch {
    // Nada que borrar
  }
}

/** Elige el idioma: lo descarga si hace falta y recarga la app. */
export async function setLanguage(lang: Language): Promise<void> {
  if (lang.code !== BASE.code && !read<Pack>(packKey(lang.code))) await downloadLanguage(lang);
  localStorage.setItem(CHOICE_KEY, lang.code);
  location.reload();
}

/** Marca el español como elegido (sin recargar). */
export function keepSpanish() {
  try {
    localStorage.setItem(CHOICE_KEY, BASE.code);
  } catch {
    // Sin almacenamiento
  }
}

/**
 * Carga el idioma elegido antes de pintar la app. Si el paquete es de una
 * versión anterior, se usa igualmente y se actualiza en segundo plano.
 */
export function initLanguage() {
  let code: string | null = null;
  try {
    code = localStorage.getItem(CHOICE_KEY);
  } catch {
    return;
  }
  if (!code || code === BASE.code) return;
  const pack = read<Pack & { name: string; locale: string }>(packKey(code));
  if (!pack) return;
  dict = pack.strings;
  current = { code: pack.code, name: pack.name, locale: pack.locale };
  document.documentElement.lang = pack.code;
  if (pack.version !== __APP_VERSION__) void downloadLanguage(current).catch(() => {});
}
