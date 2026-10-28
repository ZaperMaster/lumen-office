/*
 * Encabezado, pie de página y numeración de un documento.
 * Cada zona tiene tres partes (izquierda, centro, derecha) con texto y campos:
 *   {pagina}  número de la página       {paginas}  total de páginas
 *   {titulo}  título del documento      {fecha}    fecha de hoy      {autor}  tu nombre
 */

export type Slot = "left" | "center" | "right";
export type HeaderFooter = Record<Slot, string>;

export interface PageLayout {
  header: HeaderFooter;
  footer: HeaderFooter;
  /** Sin encabezado ni pie en la primera página (portada) */
  differentFirstPage: boolean;
  /** Número de la primera página */
  startNumber: number;
}

export const EMPTY_HF: HeaderFooter = { left: "", center: "", right: "" };

export const DEFAULT_LAYOUT: PageLayout = {
  header: { ...EMPTY_HF },
  footer: { ...EMPTY_HF },
  differentFirstPage: false,
  startNumber: 1,
};

export const FIELDS: { token: string; label: string }[] = [
  { token: "{pagina}", label: "Nº de página" },
  { token: "{paginas}", label: "Total de páginas" },
  { token: "{titulo}", label: "Título" },
  { token: "{fecha}", label: "Fecha" },
  { token: "{autor}", label: "Autor" },
];

/** Formatos de número de página para el menú «Número de página». */
export const PAGE_NUMBER_FORMATS: { id: string; label: string; text: string }[] = [
  { id: "n", label: "1", text: "{pagina}" },
  { id: "pag", label: "Página 1", text: "Página {pagina}" },
  { id: "de", label: "Página 1 de 10", text: "Página {pagina} de {paginas}" },
  { id: "slash", label: "1 / 10", text: "{pagina} / {paginas}" },
  { id: "dash", label: "- 1 -", text: "- {pagina} -" },
];

export function withDefaults(layout: Partial<PageLayout> | null | undefined): PageLayout {
  return {
    header: { ...EMPTY_HF, ...(layout?.header ?? {}) },
    footer: { ...EMPTY_HF, ...(layout?.footer ?? {}) },
    differentFirstPage: layout?.differentFirstPage ?? false,
    startNumber: layout?.startNumber ?? 1,
  };
}

export function hasContent(hf: HeaderFooter): boolean {
  return !!(hf.left.trim() || hf.center.trim() || hf.right.trim());
}

export interface FieldContext {
  page: number;
  pages: number;
  title: string;
  author: string;
}

/** Sustituye los campos por su valor para una página concreta. */
export function resolveFields(text: string, ctx: FieldContext): string {
  return text
    .replaceAll("{pagina}", String(ctx.page))
    .replaceAll("{paginas}", String(ctx.pages))
    .replaceAll("{titulo}", ctx.title || "Documento sin título")
    .replaceAll("{fecha}", new Date().toLocaleDateString("es-ES"))
    .replaceAll("{autor}", ctx.author);
}

/** Encabezado y pie ya resueltos para la página `index` (0 = primera). */
export function pageTexts(layout: PageLayout, index: number, pages: number, title: string, author: string) {
  if (layout.differentFirstPage && index === 0) return { header: { ...EMPTY_HF }, footer: { ...EMPTY_HF } };
  const ctx: FieldContext = { page: layout.startNumber + index, pages, title, author };
  const map = (hf: HeaderFooter): HeaderFooter => ({
    left: resolveFields(hf.left, ctx),
    center: resolveFields(hf.center, ctx),
    right: resolveFields(hf.right, ctx),
  });
  return { header: map(layout.header), footer: map(layout.footer) };
}
