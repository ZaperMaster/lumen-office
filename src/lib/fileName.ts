/** Nombre de archivo válido en Windows a partir de un título. */
export function safeFileName(title: string) {
  return (title.trim() || "Documento").replace(/[\/:*?"<>|]+/g, "-").slice(0, 120);
}
