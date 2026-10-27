export interface ThemeTokens {
  bg: string;
  surface: string;
  surface2: string;
  surface3: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
  accentFg: string;
  paper: string;
  paperText: string;
  desk: string;
}

export interface Theme {
  id: string;
  name: string;
  dark: boolean;
  tokens: ThemeTokens;
}

export const THEMES: Theme[] = [
  {
    id: "light",
    name: "Claro",
    dark: false,
    tokens: {
      bg: "#f4f5f7", surface: "#ffffff", surface2: "#f0f1f4", surface3: "#e6e8ec",
      border: "#e1e3e8", text: "#1c1e24", textMuted: "#646a76",
      accent: "#6d4aff", accentFg: "#ffffff",
      paper: "#ffffff", paperText: "#1c1e24", desk: "#e9ebef",
    },
  },
  {
    id: "dark",
    name: "Oscuro",
    dark: true,
    tokens: {
      bg: "#141518", surface: "#1c1d22", surface2: "#24262c", surface3: "#2e3038",
      border: "#2e3038", text: "#ececf1", textMuted: "#9a9fac",
      accent: "#8b72ff", accentFg: "#ffffff",
      paper: "#1f2026", paperText: "#e6e6ec", desk: "#111215",
    },
  },
  {
    id: "midnight",
    name: "Medianoche",
    dark: true,
    tokens: {
      bg: "#0d1321", surface: "#131b2e", surface2: "#1a2339", surface3: "#233050",
      border: "#24304a", text: "#e3e9f6", textMuted: "#8e9bb8",
      accent: "#4f9dff", accentFg: "#ffffff",
      paper: "#16203a", paperText: "#e3e9f6", desk: "#0a0f1a",
    },
  },
  {
    id: "graphite",
    name: "Grafito",
    dark: true,
    tokens: {
      bg: "#1a1a1a", surface: "#222222", surface2: "#2a2a2a", surface3: "#353535",
      border: "#333333", text: "#f0f0f0", textMuted: "#a0a0a0",
      accent: "#f5a524", accentFg: "#1a1a1a",
      paper: "#262626", paperText: "#ededed", desk: "#141414",
    },
  },
  {
    id: "sepia",
    name: "Sepia",
    dark: false,
    tokens: {
      bg: "#efe6d6", surface: "#f8f1e4", surface2: "#efe5d3", surface3: "#e4d7c0",
      border: "#dccfb7", text: "#3b2f22", textMuted: "#7d6b55",
      accent: "#b0662c", accentFg: "#ffffff",
      paper: "#fbf5ea", paperText: "#3b2f22", desk: "#e6dbc7",
    },
  },
  {
    id: "forest",
    name: "Bosque",
    dark: false,
    tokens: {
      bg: "#eef3ee", surface: "#fbfdfb", surface2: "#e9f0e9", surface3: "#dbe6db",
      border: "#d3e0d3", text: "#1d2b20", textMuted: "#5e7362",
      accent: "#2f8f57", accentFg: "#ffffff",
      paper: "#ffffff", paperText: "#1d2b20", desk: "#e2ebe2",
    },
  },
  {
    id: "ocean",
    name: "Océano",
    dark: false,
    tokens: {
      bg: "#eaf3f8", surface: "#fafdff", surface2: "#e5f0f6", surface3: "#d4e5ef",
      border: "#cfe0ea", text: "#13293a", textMuted: "#557085",
      accent: "#0a84c2", accentFg: "#ffffff",
      paper: "#ffffff", paperText: "#13293a", desk: "#dce9f1",
    },
  },
  {
    id: "rose",
    name: "Rosa",
    dark: false,
    tokens: {
      bg: "#f9eef1", surface: "#fffafb", surface2: "#f6e7ec", surface3: "#eed6de",
      border: "#ecd6dd", text: "#3a1d27", textMuted: "#87606d",
      accent: "#d6336c", accentFg: "#ffffff",
      paper: "#ffffff", paperText: "#3a1d27", desk: "#f1e0e6",
    },
  },
  {
    id: "lavender",
    name: "Lavanda",
    dark: false,
    tokens: {
      bg: "#f1effa", surface: "#fcfbff", surface2: "#ebe8f7", surface3: "#ddd8f0",
      border: "#dfdaf1", text: "#251f3d", textMuted: "#6c6589",
      accent: "#7c4dff", accentFg: "#ffffff",
      paper: "#ffffff", paperText: "#251f3d", desk: "#e6e2f4",
    },
  },
  {
    id: "contrast",
    name: "Alto contraste",
    dark: true,
    tokens: {
      bg: "#000000", surface: "#0a0a0a", surface2: "#141414", surface3: "#1f1f1f",
      border: "#5a5a5a", text: "#ffffff", textMuted: "#d0d0d0",
      accent: "#ffe600", accentFg: "#000000",
      paper: "#000000", paperText: "#ffffff", desk: "#000000",
    },
  },
];

export const ACCENT_PRESETS = [
  "#6d4aff", "#4f9dff", "#0a84c2", "#14b8a6", "#2f8f57", "#84cc16",
  "#f5a524", "#f97316", "#ef4444", "#d6336c", "#a855f7", "#64748b",
];

export function getTheme(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

/** Calcula si un color de fondo necesita texto claro u oscuro. */
export function readableOn(hex: string): string {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? "#111111" : "#ffffff";
}

export interface ApplyThemeOptions {
  themeId: string;
  accent: string | null;
  paperMode: "theme" | "white";
  uiFont: string;
  radius: number;
}

export function applyTheme({ themeId, accent, paperMode, uiFont, radius }: ApplyThemeOptions) {
  const theme = getTheme(themeId);
  const t = { ...theme.tokens };
  if (accent) {
    t.accent = accent;
    t.accentFg = readableOn(accent);
  }
  if (paperMode === "white") {
    t.paper = "#ffffff";
    t.paperText = "#1c1e24";
  }
  const root = document.documentElement;
  const vars: Record<string, string> = {
    "--bg": t.bg,
    "--surface": t.surface,
    "--surface-2": t.surface2,
    "--surface-3": t.surface3,
    "--border": t.border,
    "--text": t.text,
    "--text-muted": t.textMuted,
    "--accent": t.accent,
    "--accent-fg": t.accentFg,
    "--paper": t.paper,
    "--paper-text": t.paperText,
    "--desk": t.desk,
    "--ui-font": uiFont,
    "--radius": `${radius}px`,
    "--shadow": theme.dark
      ? "0 1px 2px rgb(0 0 0 / 0.4), 0 8px 24px rgb(0 0 0 / 0.35)"
      : "0 1px 2px rgb(0 0 0 / 0.06), 0 8px 24px rgb(0 0 0 / 0.06)",
  };
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.style.colorScheme = theme.dark ? "dark" : "light";
  root.dataset.theme = theme.id;
  // La hoja puede ser blanca aunque el tema sea oscuro: lo que cuenta es el color del papel
  root.dataset.dark = String(theme.dark && paperMode !== "white");
}
