import {
  CreateWebWorkerMLCEngine, deleteModelAllInfoInCache, hasModelInCache, type ChatCompletionMessageParam, type WebWorkerMLCEngine,
} from "@mlc-ai/web-llm";
import { LOCAL_MODELS, useLocalAI, webgpuAvailable, type ChatMsg } from "@/lib/localModels";

/** Tamaño de contexto (tokens) con el que se carga el modelo. */
const CONTEXT_WINDOW = 8192;

let worker: Worker | null = null;
let engine: WebWorkerMLCEngine | null = null;
let loading: Promise<WebWorkerMLCEngine> | null = null;
let loadingModel: string | null = null;

function translateProgress(text: string): string {
  const mb = text.match(/(\d+)\s*MB/)?.[1];
  if (/from cache|Loading model from/i.test(text)) return mb ? `Cargando el modelo desde el disco… ${mb} MB` : "Cargando el modelo desde el disco…";
  if (/Fetching param|fetch params|fetched/i.test(text)) return mb ? `Descargando el modelo… ${mb} MB` : "Descargando el modelo…";
  if (/Loading GPU shader|Compiling/i.test(text)) return "Preparando la tarjeta gráfica…";
  if (/Finish loading/i.test(text)) return "Modelo listo";
  return "Cargando el modelo…";
}

/** Carga (descargando si hace falta) el modelo indicado y devuelve el motor. */
export async function ensureModel(modelId: string): Promise<WebWorkerMLCEngine> {
  if (!webgpuAvailable()) {
    throw new Error("Este equipo no admite WebGPU. Usa Ollama en Configuración → Inteligencia artificial.");
  }
  if (engine && useLocalAI.getState().loadedModel === modelId) return engine;
  if (loading && loadingModel === modelId) return loading;

  const onProgress = (r: { progress: number; text: string }) =>
    useLocalAI.setState({ status: "loading", progress: r.progress, message: translateProgress(r.text) });

  loadingModel = modelId;
  useLocalAI.setState({ status: "loading", progress: 0, message: "Iniciando…", error: null });
  loading = (async () => {
    try {
      if (!engine) {
        worker = new Worker(new URL("./llm-worker.ts", import.meta.url), { type: "module" });
        engine = await CreateWebWorkerMLCEngine(worker, modelId, { initProgressCallback: onProgress }, { context_window_size: CONTEXT_WINDOW });
      } else {
        engine.setInitProgressCallback(onProgress);
        await engine.reload(modelId, { context_window_size: CONTEXT_WINDOW });
      }
      useLocalAI.setState((s) => ({
        status: "ready",
        progress: 1,
        message: "Modelo listo",
        loadedModel: modelId,
        cached: { ...s.cached, [modelId]: true },
      }));
      return engine;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      useLocalAI.setState({ status: "error", error: friendlyError(msg), loadedModel: null });
      throw new Error(friendlyError(msg));
    } finally {
      loading = null;
      loadingModel = null;
    }
  })();
  return loading;
}

function friendlyError(msg: string): string {
  if (/out of memory|OOM|allocate/i.test(msg)) return "La tarjeta gráfica no tiene memoria suficiente para este modelo. Elige uno más pequeño.";
  if (/fetch|network|Failed to fetch/i.test(msg)) return "No se pudo descargar el modelo. Comprueba la conexión (solo hace falta la primera vez).";
  if (/WebGPU|adapter/i.test(msg)) return "No se pudo usar la tarjeta gráfica (WebGPU). Prueba con Ollama.";
  return `Error del modelo local: ${msg}`;
}

export async function refreshCached() {
  const entries = await Promise.all(LOCAL_MODELS.map(async (m) => [m.id, await hasModelInCache(m.id).catch(() => false)] as const));
  useLocalAI.setState({ cached: Object.fromEntries(entries) });
}

export async function deleteLocalModel(modelId: string) {
  if (useLocalAI.getState().loadedModel === modelId && engine) {
    await engine.unload();
    useLocalAI.setState({ status: "idle", loadedModel: null, progress: 0, message: "" });
  }
  await deleteModelAllInfoInCache(modelId);
  // La librería deja algún archivo suelto (p. ej. tensor-cache.json): se borra todo lo del modelo
  for (const name of await caches.keys()) {
    if (!name.startsWith("webllm")) continue;
    const cache = await caches.open(name);
    for (const req of await cache.keys()) if (req.url.includes(modelId)) await cache.delete(req);
  }
  await refreshCached();
}

/** Genera texto con el modelo integrado, en streaming. */
export async function streamWebLLM(opts: {
  modelId: string;
  system: string;
  messages: ChatMsg[];
  signal?: AbortSignal;
  temperature?: number;
  onText?: (delta: string, full: string) => void;
}): Promise<string> {
  const eng = await ensureModel(opts.modelId);
  const messages: ChatCompletionMessageParam[] = [{ role: "system", content: opts.system }, ...opts.messages];
  const onAbort = () => eng.interruptGenerate();
  opts.signal?.addEventListener("abort", onAbort);
  let full = "";
  try {
    const chunks = await eng.chat.completions.create({ messages, stream: true, temperature: opts.temperature ?? 0.6, top_p: 0.9, max_tokens: 2048 });
    for await (const chunk of chunks) {
      const delta = chunk.choices[0]?.delta?.content ?? "";
      if (!delta) continue;
      full += delta;
      opts.onText?.(delta, full);
      if (opts.signal?.aborted) break;
    }
    return full;
  } finally {
    opts.signal?.removeEventListener("abort", onAbort);
  }
}

/* ------------------------------------------------------------------ */
/*  Ollama (servidor local opcional)                                   */
/* ------------------------------------------------------------------ */

export async function listOllamaModels(baseUrl: string): Promise<string[]> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/tags`);
  if (!res.ok) throw new Error(`Ollama respondió ${res.status}`);
  const data = (await res.json()) as { models?: { name: string }[] };
  return (data.models ?? []).map((m) => m.name);
}

export async function streamOllama(opts: {
  baseUrl: string;
  model: string;
  system: string;
  messages: ChatMsg[];
  signal?: AbortSignal;
  temperature?: number;
  onText?: (delta: string, full: string) => void;
}): Promise<string> {
  if (!opts.model) throw new Error("Elige un modelo de Ollama en Configuración → Inteligencia artificial.");
  let res: Response;
  try {
    res = await fetch(`${opts.baseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: opts.model,
        stream: true,
        messages: [{ role: "system", content: opts.system }, ...opts.messages],
        options: { temperature: opts.temperature ?? 0.6, num_ctx: CONTEXT_WINDOW },
      }),
      signal: opts.signal,
    });
  } catch (e) {
    if (opts.signal?.aborted) return "";
    throw new Error("No se pudo conectar con Ollama. ¿Está abierto en este equipo?", { cause: e });
  }
  if (!res.ok || !res.body) throw new Error(`Ollama respondió con un error (${res.status}).`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const data = JSON.parse(line) as { message?: { content?: string }; error?: string };
        if (data.error) throw new Error(`Ollama: ${data.error}`);
        const delta = data.message?.content ?? "";
        if (delta) {
          full += delta;
          opts.onText?.(delta, full);
        }
      }
    }
  } catch (e) {
    if (opts.signal?.aborted) return full;
    throw e;
  }
  return full;
}
