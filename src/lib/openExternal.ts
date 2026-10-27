/** Esquemas que se permite abrir desde un documento. */
const SAFE = /^(https?:|mailto:|tel:)/i;

/** Normaliza lo que escribe el usuario: «ejemplo.com» → «https://ejemplo.com». */
export function normalizeUrl(raw: string): string {
  const url = raw.trim();
  if (!url) return url;
  if (SAFE.test(url)) return url;
  if (/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(url)) return `mailto:${url}`;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return url; // otro esquema: se valida al abrir
  return `https://${url}`;
}

/**
 * Abre un vínculo en el navegador predeterminado del sistema.
 * En la app de escritorio usa el plugin de Tauri; en el navegador, una pestaña nueva.
 */
export async function openExternal(raw: string): Promise<void> {
  const url = normalizeUrl(raw);
  // Nunca se abren esquemas peligrosos (javascript:, file:, etc.)
  if (!SAFE.test(url)) throw new Error("Este vínculo no se puede abrir por seguridad.");
  if ("__TAURI_INTERNALS__" in window) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
