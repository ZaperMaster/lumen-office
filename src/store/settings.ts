import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { FontDef } from "@/lib/fonts";
import { DEFAULT_LOCAL_MODEL } from "@/lib/localModels";

export type PageSize = "A4" | "Letter" | "Legal" | "A5";
export type Orientation = "portrait" | "landscape";
export type Margins = "normal" | "narrow" | "moderate" | "wide";
export type ViewMode = "page" | "web" | "focus";
export type AIEngine = "webllm" | "ollama" | "api";

export interface Settings {
  // Apariencia
  themeId: string;
  accent: string | null;
  paperMode: "theme" | "white";
  uiFont: string;
  radius: number;
  // Editor
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  paraSpacing: number;
  spellcheck: boolean;
  smartTyping: boolean;
  // Página
  pageSize: PageSize;
  orientation: Orientation;
  margins: Margins;
  viewMode: ViewMode;
  zoom: number;
  // Fuentes extra cargadas desde el sistema
  localFonts: FontDef[];
  recentFonts: string[];
  // IA
  aiEngine: AIEngine;
  localModel: string;
  ollamaUrl: string;
  ollamaModel: string;
  /** Minutos sin usar la IA local antes de liberar la memoria (0 = nunca) */
  aiUnloadMinutes: number;
  // API propia
  apiProvider: "openai" | "anthropic";
  openaiBaseUrl: string;
  openaiKey: string;
  openaiModel: string;
  anthropicKey: string;
  anthropicModel: string;
  aiLanguage: string;
  // Interfaz
  ribbonCollapsed: boolean;
  notesSidebarWidth: number;
  userName: string;
}

interface SettingsActions {
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  patch: (p: Partial<Settings>) => void;
  pushRecentFont: (css: string) => void;
  reset: () => void;
}

export const DEFAULT_SETTINGS: Settings = {
  themeId: "light",
  accent: null,
  paperMode: "theme",
  uiFont: `"Inter Variable", "Segoe UI", system-ui, sans-serif`,
  radius: 10,
  fontFamily: `"Inter Variable", system-ui, sans-serif`,
  fontSize: 12,
  lineHeight: 1.5,
  paraSpacing: 0.6,
  spellcheck: true,
  smartTyping: true,
  pageSize: "A4",
  orientation: "portrait",
  margins: "normal",
  viewMode: "page",
  zoom: 100,
  localFonts: [],
  recentFonts: [],
  aiEngine: "webllm",
  localModel: DEFAULT_LOCAL_MODEL,
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "",
  aiUnloadMinutes: 5,
  apiProvider: "openai",
  openaiBaseUrl: "https://api.openai.com/v1",
  openaiKey: "",
  openaiModel: "",
  anthropicKey: "",
  anthropicModel: "claude-opus-5-5",
  aiLanguage: "español",
  ribbonCollapsed: false,
  notesSidebarWidth: 300,
  userName: "",
};

export const useSettings = create<Settings & SettingsActions>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      set: (key, value) => set({ [key]: value } as Partial<Settings>),
      patch: (p) => set(p),
      pushRecentFont: (css) =>
        set((s) => ({ recentFonts: [css, ...s.recentFonts.filter((f) => f !== css)].slice(0, 6) })),
      reset: () => set({ ...DEFAULT_SETTINGS }),
    }),
    {
      name: "lumen.settings",
      version: 2,
      // v2: la IA pasa a ser local; se elimina la antigua clave de API guardada
      migrate: (persisted) => {
        const { aiApiKey: _k, aiModel: _m, ...rest } = (persisted ?? {}) as Record<string, unknown>;
        return rest as unknown as Settings & SettingsActions;
      },
    },
  ),
);

/** Tamaños de página en milímetros (vertical). */
export const PAGE_SIZES: Record<PageSize, { label: string; w: number; h: number }> = {
  A4: { label: "A4 (21 × 29,7 cm)", w: 210, h: 297 },
  Letter: { label: "Carta (21,6 × 27,9 cm)", w: 215.9, h: 279.4 },
  Legal: { label: "Oficio (21,6 × 35,6 cm)", w: 215.9, h: 355.6 },
  A5: { label: "A5 (14,8 × 21 cm)", w: 148, h: 210 },
};

/** Márgenes en milímetros: [vertical, horizontal]. */
export const MARGINS: Record<Margins, { label: string; v: number; h: number }> = {
  normal: { label: "Normal (2,5 cm)", v: 25, h: 25 },
  narrow: { label: "Estrecho (1,27 cm)", v: 12.7, h: 12.7 },
  moderate: { label: "Moderado (2,54 / 1,91 cm)", v: 25.4, h: 19.1 },
  wide: { label: "Ancho (2,54 / 5,08 cm)", v: 25.4, h: 50.8 },
};

export const MM_TO_PX = 96 / 25.4;
