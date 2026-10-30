/*
 * Modelo de las presentaciones. Las diapositivas miden 1280 × 720 unidades
 * (16:9); los elementos se colocan con coordenadas en esas unidades.
 */

export const SLIDE_W = 1280;
export const SLIDE_H = 720;

export type ShapeKind = "rect" | "roundRect" | "ellipse" | "triangle" | "diamond" | "arrow" | "star" | "line";
export type ElType = "text" | "shape" | "image";
export type Anim =
  | "none" | "fade" | "fly" | "flyDown" | "flyLeft" | "flyRight" | "zoom" | "grow" | "bounce" | "spin" | "flip"
  | "wipe" | "blur" | "pop" | "swing" | "typewriter" | "pulse" | "shake";
export type AnimTrigger = "click" | "with" | "after";
export type Transition = "none" | "fade" | "slide" | "push" | "zoom" | "flip" | "wipe" | "blur";

/** Animaciones disponibles, con su nombre y un icono para la galería. */
export const ANIMS: { id: Anim; label: string; icon: string; group: "Entrada" | "Énfasis" }[] = [
  { id: "fade", label: "Aparecer", icon: "◐", group: "Entrada" },
  { id: "fly", label: "Desde abajo", icon: "⬆", group: "Entrada" },
  { id: "flyDown", label: "Desde arriba", icon: "⬇", group: "Entrada" },
  { id: "flyLeft", label: "Desde la izquierda", icon: "➡", group: "Entrada" },
  { id: "flyRight", label: "Desde la derecha", icon: "⬅", group: "Entrada" },
  { id: "zoom", label: "Acercar", icon: "🔍", group: "Entrada" },
  { id: "grow", label: "Crecer", icon: "⤢", group: "Entrada" },
  { id: "pop", label: "Saltar", icon: "✸", group: "Entrada" },
  { id: "bounce", label: "Rebotar", icon: "⤓", group: "Entrada" },
  { id: "spin", label: "Girar", icon: "⟳", group: "Entrada" },
  { id: "flip", label: "Voltear", icon: "⇋", group: "Entrada" },
  { id: "wipe", label: "Barrido", icon: "▤", group: "Entrada" },
  { id: "blur", label: "Desenfoque", icon: "◌", group: "Entrada" },
  { id: "swing", label: "Columpio", icon: "〰", group: "Entrada" },
  { id: "typewriter", label: "Máquina de escribir", icon: "⌨", group: "Entrada" },
  { id: "pulse", label: "Latido", icon: "♥", group: "Énfasis" },
  { id: "shake", label: "Sacudir", icon: "≋", group: "Énfasis" },
];

export const animLabel = (a?: Anim) => (a && a !== "none" ? (ANIMS.find((x) => x.id === a)?.label ?? a) : "Ninguna");

export const TRANSITIONS: { id: Transition; label: string; icon: string }[] = [
  { id: "none", label: "Ninguna", icon: "▢" },
  { id: "fade", label: "Desvanecer", icon: "◐" },
  { id: "slide", label: "Deslizar", icon: "⇠" },
  { id: "push", label: "Empujar", icon: "⇡" },
  { id: "zoom", label: "Zoom", icon: "🔍" },
  { id: "flip", label: "Voltear", icon: "⇋" },
  { id: "wipe", label: "Barrido", icon: "▤" },
  { id: "blur", label: "Desenfoque", icon: "◌" },
];

export const TRIGGERS: { id: AnimTrigger; label: string; hint: string }[] = [
  { id: "click", label: "Al hacer clic", hint: "Aparece cuando haces clic al presentar" },
  { id: "with", label: "Con la anterior", hint: "A la vez que la animación anterior" },
  { id: "after", label: "Después de la anterior", hint: "Justo cuando termina la anterior" },
];

export interface AnimStep {
  id: string;
  /** Paso (0 = al entrar en la diapositiva; cada clic avanza uno) */
  step: number;
  /** Segundos desde el inicio del paso */
  start: number;
  dur: number;
}

/**
 * Cuándo aparece cada elemento animado. Las animaciones «al hacer clic» abren
 * un paso nuevo; «con la anterior» empieza a la vez y «después» al terminar.
 */
export function animTimeline(slide: Slide): { items: Map<string, AnimStep>; steps: number } {
  const items = new Map<string, AnimStep>();
  let step = 0;
  let prevStart = 0;
  let prevEnd = 0;
  let first = true;
  for (const el of slide.els) {
    if (!el.anim || el.anim === "none") continue;
    const dur = el.animDur ?? 0.6;
    const delay = el.animDelay ?? 0;
    // Las presentaciones antiguas no tenían «cuándo»: aparecían solas, una tras otra
    const trigger = el.animTrigger ?? "after";
    let start: number;
    if (trigger === "click") {
      step += 1;
      start = delay;
    } else if (trigger === "with" && !first) start = prevStart + delay;
    else start = (first ? 0.2 : prevEnd) + delay;
    items.set(el.id, { id: el.id, step, start, dur });
    prevStart = start;
    prevEnd = start + dur;
    first = false;
  }
  return { items, steps: step };
}
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
  /** Cuándo empieza la animación, cuánto dura y cuánto espera (segundos) */
  animTrigger?: AnimTrigger;
  animDur?: number;
  animDelay?: number;
  /** Esquinas redondeadas (px) de imágenes y cuadros de texto */
  radius?: number;
  shadow?: boolean;
  flipH?: boolean;
  flipV?: boolean;
  /** Imágenes: estirar, recortar para llenar o encajar entera */
  fit?: "fill" | "cover" | "contain";
  /** Imágenes recortadas en círculo */
  circle?: boolean;
  /** Interlineado del texto */
  lineHeight?: number;
  /** Ajustes de imagen (100 = normal) y filtros */
  bright?: number;
  contrast?: number;
  saturate?: number;
  gray?: boolean;
  sepia?: boolean;
  blurPx?: number;
  /** Recorte de la imagen (% de cada lado) */
  crop?: { t: number; r: number; b: number; l: number };
  /** Marco blanco alrededor (px) */
  frame?: number;
}

export interface Slide {
  id: string;
  els: SlideEl[];
  /** Color de fondo; si falta, el del tema */
  bg?: string;
  notes?: string;
  transition?: Transition;
  /** Imagen de fondo (data URL) */
  bgImage?: string;
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
