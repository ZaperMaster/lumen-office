import { create } from "zustand";

/*
 * Catálogo y estado de la IA local. Este módulo es ligero a propósito:
 * el motor (WebLLM) vive en localAI.ts y solo se carga al usar la IA.
 */

export interface LocalModel {
  id: string;
  name: string;
  /** Tamaño aproximado de descarga en GB */
  sizeGB: number;
  /** Memoria de vídeo necesaria en GB */
  vramGB: number;
  hint: string;
}

export const LOCAL_MODELS: LocalModel[] = [
  { id: "Qwen2.5-3B-Instruct-q4f16_1-MLC", name: "Qwen 2.5 · 3B", sizeGB: 1.7, vramGB: 2.5, hint: "Recomendado: buen equilibrio entre calidad y velocidad, muy bueno en español" },
  { id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC", name: "Qwen 2.5 · 1.5B", sizeGB: 0.9, vramGB: 1.6, hint: "El más rápido y ligero; ideal para equipos modestos" },
  { id: "Llama-3.2-3B-Instruct-q4f16_1-MLC", name: "Llama 3.2 · 3B", sizeGB: 1.8, vramGB: 2.3, hint: "Alternativa de Meta, buena redacción" },
  { id: "Qwen2.5-7B-Instruct-q4f16_1-MLC", name: "Qwen 2.5 · 7B", sizeGB: 4.3, vramGB: 5.1, hint: "Máxima calidad; necesita una gráfica con 6 GB o más" },
];

export const DEFAULT_LOCAL_MODEL = LOCAL_MODELS[0].id;

export interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

interface LocalAIState {
  status: "idle" | "loading" | "ready" | "error";
  /** 0..1 durante la descarga/carga */
  progress: number;
  message: string;
  loadedModel: string | null;
  error: string | null;
  /** Modelos ya descargados en este equipo */
  cached: Record<string, boolean>;
}

export const useLocalAI = create<LocalAIState>(() => ({
  status: "idle",
  progress: 0,
  message: "",
  loadedModel: null,
  error: null,
  cached: {},
}));

export function webgpuAvailable(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

/** Carga perezosa del motor local. */
export const loadEngine = () => import("@/lib/localAI");
