/*
 * Modelo de las presentaciones. Las diapositivas miden 1280 × 720 unidades
 * (16:9); los elementos se colocan con coordenadas en esas unidades.
 */

export const SLIDE_W = 1280;
export const SLIDE_H = 720;

export type ShapeKind = "rect" | "roundRect" | "ellipse" | "triangle" | "diamond" | "arrow" | "star" | "line";
export type ElType = "text" | "shape" | "image";
export type Anim = "none" | "fade" | "fly" | "zoom";
export type Transition = "none" | "fade" | "slide" | "zoom";
export type Role = "title" | "subtitle" | "body";

export interface SlideEl {
  id: string;
  type: ElType;
  x: number;
  y: number;
  w: number;
  h: number;
  rot?: number;
  /** Texto (HTML sencillo: párrafos, listas, negrita, cursiva, subrayado y color) */
  html?: string;
  /** Marcador del diseño: toma colores y fuentes del tema */
  role?: Role;
  placeholder?: string;
  fontSize?: number;
  font?: string;
  color?: string;
  align?: "left" | "center" | "right";
  valign?: "top" | "middle" | "bottom";
  bold?: boolean;
  shape?: ShapeKind;
  fill?: string;
  stroke?: string;
  strokeW?: number;
  src?: string;
  opacity?: number;
  anim?: Anim;
}

export interface Slide {
  id: string;
  els: SlideEl[];
  /** Color de fondo; si falta, el del tema */
  bg?: string;
  notes?: string;
  transition?: Transition;
}

export interface Deck {
  theme: string;
  slides: Slide[];
}

export interface Theme {
  id: string;
  name: string;
  bg: string;
  title: string;
  text: string;
  accent: string;
  titleFont: string;
  bodyFont: string;
  /** Franja o adorno opcional del tema */
  band?: string;
}

export const THEMES: Theme[] = [
  { id: "clean", name: "Claro", bg: "#ffffff", title: "#1c1e24", text: "#3a3f4b", accent: "#4f7cff", titleFont: `"Inter Variable", sans-serif`, bodyFont: `"Inter Variable", sans-serif` },
  { id: "dark", name: "Noche", bg: "#14161c", title: "#ffffff", text: "#c9cdd6", accent: "#8b9cff", titleFont: `"Inter Variable", sans-serif`, bodyFont: `"Inter Variable", sans-serif` },
  { id: "ocean", name: "Océano", bg: "#0f3d5e", title: "#ffffff", text: "#d6ecf7", accent: "#5ad1e6", titleFont: `"Montserrat Variable", sans-serif`, bodyFont: `"Open Sans Variable", sans-serif` },
  { id: "forest", name: "Bosque", bg: "#f3f6ef", title: "#1f4d2b", text: "#33402f", accent: "#3b8a4f", titleFont: `"Lora Variable", serif`, bodyFont: `"Source Serif 4 Variable", serif`, band: "#3b8a4f" },
  { id: "sunset", name: "Atardecer", bg: "#fff6ee", title: "#b23a16", text: "#4a3226", accent: "#f08a24", titleFont: `"Playfair Display Variable", serif`, bodyFont: `"Lora Variable", serif`, band: "#f08a24" },
  { id: "violet", name: "Violeta", bg: "#1b1033", title: "#ffffff", text: "#ddd3f5", accent: "#c084fc", titleFont: `"Raleway Variable", sans-serif`, bodyFont: `"Nunito Variable", sans-serif` },
  { id: "paper", name: "Papel", bg: "#faf7f0", title: "#2b2b2b", text: "#4a4a4a", accent: "#c0392b", titleFont: `"EB Garamond Variable", serif`, bodyFont: `"EB Garamond Variable", serif`, band: "#c0392b" },
  { id: "corporate", name: "Corporativo", bg: "#ffffff", title: "#123a6b", text: "#33475b", accent: "#1f6feb", titleFont: `"Roboto Variable", sans-serif`, bodyFont: `"Roboto Variable", sans-serif`, band: "#123a6b" },
];

export const theme = (id: string) => THEMES.find((t) => t.id === id) ?? THEMES[0];

let seq = 0;
export const sid = () => `${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/* ------------------------------------------------------------------ */
/*  Diseños                                                            */
/* ------------------------------------------------------------------ */

export type LayoutId = "title" | "content" | "two" | "section" | "titleOnly" | "image" | "blank";

export const LAYOUTS: { id: LayoutId; name: string }[] = [
  { id: "title", name: "Diapositiva de título" },
  { id: "content", name: "Título y contenido" },
  { id: "two", name: "Dos columnas" },
  { id: "section", name: "Encabezado de sección" },
  { id: "titleOnly", name: "Solo el título" },
  { id: "image", name: "Título e imagen" },
  { id: "blank", name: "En blanco" },
];

const text = (role: Role, x: number, y: number, w: number, h: number, extra: Partial<SlideEl> = {}): SlideEl => ({
  id: sid(),
  type: "text",
  role,
  x,
  y,
  w,
  h,
  html: "",
  fontSize: role === "title" ? 52 : role === "subtitle" ? 30 : 28,
  align: "left",
  valign: role === "body" ? "top" : "middle",
  bold: role === "title",
  ...extra,
});

export function layoutEls(id: LayoutId): SlideEl[] {
  switch (id) {
    case "title":
      return [
        text("title", 120, 220, 1040, 150, { align: "center", fontSize: 64, placeholder: "Haz clic para añadir un título" }),
        text("subtitle", 200, 390, 880, 80, { align: "center", placeholder: "Haz clic para añadir un subtítulo" }),
      ];
    case "content":
      return [
        text("title", 80, 50, 1120, 110, { placeholder: "Título de la diapositiva" }),
        text("body", 80, 180, 1120, 480, { html: "<ul><li></li></ul>", placeholder: "Escribe los puntos" }),
      ];
    case "two":
      return [
        text("title", 80, 50, 1120, 110, { placeholder: "Título de la diapositiva" }),
        text("body", 80, 180, 540, 480, { html: "<ul><li></li></ul>", placeholder: "Columna izquierda" }),
        text("body", 660, 180, 540, 480, { html: "<ul><li></li></ul>", placeholder: "Columna derecha" }),
      ];
    case "section":
      return [
        text("title", 100, 250, 1080, 140, { fontSize: 60, placeholder: "Título de la sección" }),
        text("subtitle", 100, 400, 1080, 70, { placeholder: "Descripción" }),
      ];
    case "titleOnly":
      return [text("title", 80, 50, 1120, 110, { placeholder: "Título de la diapositiva" })];
    case "image":
      return [
        text("title", 80, 50, 1120, 110, { placeholder: "Título de la diapositiva" }),
        { id: sid(), type: "shape", shape: "roundRect", x: 240, y: 190, w: 800, h: 460, fill: "#00000010", stroke: "#00000030", strokeW: 2, html: "", placeholder: "Inserta una imagen (Insertar → Imagen)", align: "center", valign: "middle", fontSize: 22 },
      ];
    default:
      return [];
  }
}

export function newSlide(layout: LayoutId = "content"): Slide {
  return { id: sid(), els: layoutEls(layout) };
}

export function newDeck(themeId = "clean"): Deck {
  return { theme: themeId, slides: [newSlide("title")] };
}

/** Texto plano de un HTML de diapositiva. */
export function htmlText(html?: string): string {
  if (!html) return "";
  return html
    .replace(/<(br|\/p|\/li|\/div)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/** Texto plano de la presentación (búsqueda y vista previa). */
export function deckText(deck: Deck, max = 4000): string {
  const out: string[] = [];
  for (const s of deck.slides) for (const e of s.els) if (e.html) out.push(htmlText(e.html));
  return out.join(" ").replace(/\s+/g, " ").slice(0, max);
}

/** Escapa un texto para meterlo en HTML. */
export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
