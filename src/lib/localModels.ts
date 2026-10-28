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
  /** Licencia del modelo (todos permiten el uso comercial) */
  license: string;
}

export const LOCAL_MODELS: LocalModel[] = [
  // El primero es el predeterminado. Solo modelos cuya licencia permite el uso comercial
  { id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC", name: "Qwen 2.5 · 1.5B", sizeGB: 0.9, vramGB: 1.6, hint: "Recomendado: rápido y ligero, va bien en casi cualquier equipo", license: "Apache 2.0" },
  { id: "Qwen2.5-7B-Instruct-q4f16_1-MLC", name: "Qwen 2.5 · 7B", sizeGB: 4.3, vramGB: 5.1, hint: "Máxima calidad; necesita una gráfica con 6 GB o más", license: "Apache 2.0" },
  { id: "Llama-3.2-3B-Instruct-q4f16_1-MLC", name: "Llama 3.2 · 3B", sizeGB: 1.8, vramGB: 2.3, hint: "Alternativa de Meta, buena redacción", license: "Llama 3.2 Community License" },
];

export const DEFAULT_LOCAL_MODEL = LOCAL_MODELS[0].id;

/** Modelos que ya no se ofrecen (licencia no comercial): se borran si están descargados. */
const RETIRED_MODELS = ["Qwen2.5-3B-Instruct"];

/** Libera el disco que ocupen modelos retirados, sin cargar el motor. */
export async function removeRetiredModels() {
  try {
    for (const name of await caches.keys()) {
      if (!name.startsWith("webllm")) continue;
      const cache = await caches.open(name);
      for (const req of await cache.keys()) if (RETIRED_MODELS.some((id) => req.url.includes(id))) await cache.delete(req);
    }
  } catch {
    // Sin caché disponible: nada que borrar
  }
}

/** Modelos de Anthropic disponibles con la API propia. */
export const ANTHROPIC_MODEL_OPTIONS = [
  { id: "claude-opus-5-5", name: "Claude Opus 5.5 (máxima calidad)" },
  { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5 (rápido)" },
  { id: "claude-haiku-5-5", name: "Claude Haiku 5.5 (el más económico)" },
];

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

/** Carga perezosa del motor local (unos 6 MB de código: solo cuando se usa). */
export const loadEngine = () => import("@/lib/localAI");

/**
 * Prepara la IA local al abrir cualquier parte de la IA, para que la primera respuesta
 * llegue al momento. Solo si el motor integrado está elegido y el modelo ya está
 * descargado: nunca inicia una descarga por su cuenta.
 */
export async function preloadLocalAI(aiEngine: string, localModel: string): Promise<void> {
  // (Recibe los ajustes como parámetros: importar la configuración aquí crearía un ciclo de módulos)
  if (aiEngine !== "webllm" || !webgpuAvailable()) return;
  const st = useLocalAI.getState();
  if (st.loadedModel === localModel && st.status === "ready") {
    // Ya cargado: solo falta asegurarse de que está calentado
    void loadEngine().then((m) => m.preloadModel(localModel));
    return;
  }
  if (st.status === "loading") return;
  await refreshCached();
  if (!useLocalAI.getState().cached[localModel]) return;
  void loadEngine().then((m) => m.preloadModel(localModel));
}

/** Carga perezosa de los proveedores remotos (Ollama y APIs). */
export const loadRemote = () => import("@/lib/remoteAI");

/**
 * Comprueba qué modelos están descargados leyendo directamente la caché del
 * navegador, sin cargar el motor. Un modelo está completo si tiene su tensor-cache.json.
 */
export async function refreshCached() {
  const cached: Record<string, boolean> = {};
  try {
    const cache = await caches.open("webllm/model");
    const urls = (await cache.keys()).map((r) => r.url);
    for (const m of LOCAL_MODELS) cached[m.id] = urls.some((u) => u.includes(`/${m.id}/`) && u.endsWith("tensor-cache.json"));
  } catch {
    /* sin acceso a la caché */
  }
  useLocalAI.setState({ cached });
}
