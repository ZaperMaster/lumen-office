import { L, uiLocale } from "@/lib/i18n";
const rtf = new Intl.RelativeTimeFormat(uiLocale(), { numeric: "auto" });

export function relativeTime(ts: number): string {
  const diff = (ts - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 45) return L("ahora mismo");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 7) return rtf.format(Math.round(diff / 86400), "day");
  return new Date(ts).toLocaleDateString(uiLocale(), { day: "numeric", month: "short", year: "numeric" });
}

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return L("Buenas noches");
  if (h < 13) return L("Buenos días");
  if (h < 21) return L("Buenas tardes");
  return L("Buenas noches");
}

export function readingTime(words: number): string {
  const min = Math.max(1, Math.round(words / 220));
  return L("{0} min de lectura", min);
}

export function debounce<A extends unknown[], R>(fn: (...a: A) => R, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  const d = (...a: A) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
  /** Ejecuta ya lo pendiente y devuelve su resultado (p. ej. la promesa del guardado) */
  d.flush = (...a: A): R => {
    clearTimeout(t);
    return fn(...a);
  };
  d.cancel = () => clearTimeout(t);
  return d;
}
