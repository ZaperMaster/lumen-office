const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });

export function relativeTime(ts: number): string {
  const diff = (ts - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 45) return "ahora mismo";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 7) return rtf.format(Math.round(diff / 86400), "day");
  return new Date(ts).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return "Buenas noches";
  if (h < 13) return "Buenos días";
  if (h < 21) return "Buenas tardes";
  return "Buenas noches";
}

export function readingTime(words: number): string {
  const min = Math.max(1, Math.round(words / 220));
  return `${min} min de lectura`;
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
