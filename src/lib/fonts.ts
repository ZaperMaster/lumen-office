// Fuentes empaquetadas con la app (funcionan sin conexión).
import "@fontsource-variable/inter";
import "@fontsource-variable/roboto";
import "@fontsource-variable/open-sans";
import "@fontsource-variable/montserrat";
import "@fontsource-variable/nunito";
import "@fontsource-variable/raleway";
import "@fontsource-variable/lora";
import "@fontsource-variable/merriweather";
import "@fontsource-variable/playfair-display";
import "@fontsource-variable/eb-garamond";
import "@fontsource-variable/source-serif-4";
import "@fontsource-variable/literata";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource-variable/fira-code";
import "@fontsource-variable/caveat";
import "@fontsource-variable/dancing-script";
import "@fontsource/poppins/400.css";
import "@fontsource/poppins/600.css";
import "@fontsource/poppins/700.css";
import "@fontsource/special-elite";

export type FontCategory = "sans" | "serif" | "mono" | "handwriting" | "display";

export interface FontDef {
  name: string;
  /** Valor CSS de font-family */
  css: string;
  category: FontCategory;
  source: "bundled" | "system" | "local";
}

const sans = ", system-ui, sans-serif";
const serif = ", Georgia, serif";
const mono = ", Consolas, monospace";

export const BUNDLED_FONTS: FontDef[] = [
  { name: "Inter", css: `"Inter Variable"${sans}`, category: "sans", source: "bundled" },
  { name: "Roboto", css: `"Roboto Variable"${sans}`, category: "sans", source: "bundled" },
  { name: "Open Sans", css: `"Open Sans Variable"${sans}`, category: "sans", source: "bundled" },
  { name: "Montserrat", css: `"Montserrat Variable"${sans}`, category: "sans", source: "bundled" },
  { name: "Nunito", css: `"Nunito Variable"${sans}`, category: "sans", source: "bundled" },
  { name: "Raleway", css: `"Raleway Variable"${sans}`, category: "sans", source: "bundled" },
  { name: "Poppins", css: `"Poppins"${sans}`, category: "sans", source: "bundled" },
  { name: "Lora", css: `"Lora Variable"${serif}`, category: "serif", source: "bundled" },
  { name: "Merriweather", css: `"Merriweather Variable"${serif}`, category: "serif", source: "bundled" },
  { name: "Playfair Display", css: `"Playfair Display Variable"${serif}`, category: "display", source: "bundled" },
  { name: "EB Garamond", css: `"EB Garamond Variable"${serif}`, category: "serif", source: "bundled" },
  { name: "Source Serif", css: `"Source Serif 4 Variable"${serif}`, category: "serif", source: "bundled" },
  { name: "Literata", css: `"Literata Variable"${serif}`, category: "serif", source: "bundled" },
  { name: "JetBrains Mono", css: `"JetBrains Mono Variable"${mono}`, category: "mono", source: "bundled" },
  { name: "Fira Code", css: `"Fira Code Variable"${mono}`, category: "mono", source: "bundled" },
  { name: "Caveat", css: `"Caveat Variable", cursive`, category: "handwriting", source: "bundled" },
  { name: "Dancing Script", css: `"Dancing Script Variable", cursive`, category: "handwriting", source: "bundled" },
  { name: "Special Elite", css: `"Special Elite", "Courier New", monospace`, category: "display", source: "bundled" },
];

/** Fuentes habituales de Windows/macOS que se usan si están instaladas. */
export const SYSTEM_FONTS: FontDef[] = [
  ["Calibri", "sans"], ["Arial", "sans"], ["Segoe UI", "sans"], ["Verdana", "sans"],
  ["Tahoma", "sans"], ["Trebuchet MS", "sans"], ["Candara", "sans"], ["Corbel", "sans"],
  ["Aptos", "sans"], ["Cambria", "serif"], ["Times New Roman", "serif"], ["Georgia", "serif"],
  ["Garamond", "serif"], ["Book Antiqua", "serif"], ["Palatino Linotype", "serif"],
  ["Constantia", "serif"], ["Consolas", "mono"], ["Courier New", "mono"],
  ["Comic Sans MS", "handwriting"], ["Segoe Print", "handwriting"], ["Impact", "display"],
].map(([name, category]) => ({
  name,
  css: `"${name}"${category === "serif" ? serif : category === "mono" ? mono : sans}`,
  category: category as FontCategory,
  source: "system" as const,
}));

export const CATEGORY_LABELS: Record<FontCategory, string> = {
  sans: "Sans serif",
  serif: "Serif",
  mono: "Monoespaciada",
  handwriting: "Manuscrita",
  display: "Decorativa",
};

export const FONT_SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72];

/** Comprueba si una fuente del sistema está instalada midiendo su ancho. */
function isInstalled(name: string): boolean {
  if (typeof document === "undefined") return false;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return true;
  const sample = "mmmmmmmmmmlli1WQ@#";
  const widths = ["monospace", "serif", "sans-serif"].map((base) => {
    ctx.font = `72px ${base}`;
    const baseW = ctx.measureText(sample).width;
    ctx.font = `72px "${name}", ${base}`;
    return ctx.measureText(sample).width !== baseW;
  });
  return widths.some(Boolean);
}

let cachedSystem: FontDef[] | null = null;
export function availableSystemFonts(): FontDef[] {
  if (!cachedSystem) cachedSystem = SYSTEM_FONTS.filter((f) => isInstalled(f.name));
  return cachedSystem;
}

interface LocalFontData {
  family: string;
}

/**
 * Lee todas las fuentes instaladas en el equipo (API Local Font Access,
 * disponible en Chromium/WebView2). Pide permiso al usuario la primera vez.
 */
export async function loadLocalFonts(): Promise<FontDef[]> {
  const q = (window as unknown as { queryLocalFonts?: () => Promise<LocalFontData[]> }).queryLocalFonts;
  if (!q) throw new Error("Este entorno no permite leer las fuentes del sistema.");
  const fonts = await q();
  const families = [...new Set(fonts.map((f) => f.family))].sort((a, b) => a.localeCompare(b));
  return families.map((family) => ({
    name: family,
    css: `"${family}"${sans}`,
    category: "sans",
    source: "local",
  }));
}

/** Busca una fuente por su valor CSS (o el primer nombre de la lista). */
export function fontNameFromCss(css: string | undefined | null, all: FontDef[]): string | null {
  if (!css) return null;
  const hit = all.find((f) => f.css === css);
  if (hit) return hit.name;
  const first = css.split(",")[0].replace(/["']/g, "").replace(" Variable", "").trim();
  return first || null;
}
