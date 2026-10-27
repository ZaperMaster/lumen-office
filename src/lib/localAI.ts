import { CreateWebWorkerMLCEngine, deleteModelAllInfoInCache, type ChatCompletionMessageParam, type WebWorkerMLCEngine } from "@mlc-ai/web-llm";
import { refreshCached, useLocalAI, webgpuAvailable, type ChatMsg } from "@/lib/localModels";
import { useSettings } from "@/store/settings";

/** Tamaño de contexto (tokens) con el que se carga el modelo. */
const CONTEXT_WINDOW = 8192;

let worker: Worker | null = null;
let engine: WebWorkerMLCEngine | null = null;
let loading: Promise<WebWorkerMLCEngine> | null = null;
let loadingModel: string | null = null;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let busy = 0;

function translateProgress(text: string): string {
  const mb = text.match(/(\d+)\s*MB/)?.[1];
  if (/from cache|Loading model from/i.test(text)) return mb ? `Cargando el modelo desde el disco… ${mb} MB` : "Cargando el modelo desde el disco…";
  if (/Fetching param|fetch params|fetched/i.test(text)) return mb ? `Descargando el modelo… ${mb} MB` : "Descargando el modelo…";
  if (/Loading GPU shader|Compiling/i.test(text)) return "Preparando la tarjeta gráfica…";
  if (/Finish loading/i.test(text)) return "Modelo listo";
  return "Cargando el modelo…";
}

/* ------------------------------------------------------------------ */
/*  Liberación de memoria                                              */
/* ------------------------------------------------------------------ */

/**
 * Descarga el modelo de la tarjeta gráfica y cierra su hilo. Con el modelo
 * cargado la app ocupa ~3 GB; sin él vuelve a unos 400 MB.
 */
export async function unloadModel() {
  clearTimeout(idleTimer);
  const eng = engine;
  const w = worker;
  engine = null;
  worker = null;
  useLocalAI.setState({ status: "idle", loadedModel: null, progress: 0, message: "" });
  try {
    await eng?.unload();
  } catch {
    /* el hilo se cierra igualmente */
  }
  w?.terminate();
}

/** Programa la liberación tras el tiempo de inactividad configurado (si está activada). */
function scheduleIdleUnload() {
  clearTimeout(idleTimer);
  const { aiAutoUnload, aiUnloadMinutes } = useSettings.getState();
  if (!aiAutoUnload || !engine) return;
  idleTimer = setTimeout(() => {
    if (busy === 0 && !loading) void unloadModel();
  }, Math.max(1, aiUnloadMinutes) * 60_000);
}

// Si el usuario cambia la opción con el modelo ya cargado, se aplica al momento
useSettings.subscribe((s, prev) => {
  if (s.aiAutoUnload !== prev.aiAutoUnload || s.aiUnloadMinutes !== prev.aiUnloadMinutes) scheduleIdleUnload();
});

/* ------------------------------------------------------------------ */
/*  Carga                                                              */
/* ------------------------------------------------------------------ */

/** Carga (descargando si hace falta) el modelo indicado y devuelve el motor. */
export async function ensureModel(modelId: string): Promise<WebWorkerMLCEngine> {
  if (!webgpuAvailable()) {
    throw new Error("Este equipo no admite WebGPU. Usa Ollama o una API en Configuración → Inteligencia artificial.");
  }
  clearTimeout(idleTimer);
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
      scheduleIdleUnload();
      return engine;
    } catch (e) {
      const msg = friendlyError(e instanceof Error ? e.message : String(e));
      // Si falla a medias, se libera todo lo reservado
      await unloadModel();
      useLocalAI.setState({ status: "error", error: msg });
      throw new Error(msg);
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
  if (/WebGPU|adapter/i.test(msg)) return "No se pudo usar la tarjeta gráfica (WebGPU). Prueba con Ollama o una API.";
  return `Error del modelo local: ${msg}`;
}

export async function deleteLocalModel(modelId: string) {
  if (useLocalAI.getState().loadedModel === modelId) await unloadModel();
  await deleteModelAllInfoInCache(modelId);
  // La librería deja algún archivo suelto (p. ej. tensor-cache.json): se borra todo lo del modelo
  for (const name of await caches.keys()) {
    if (!name.startsWith("webllm")) continue;
    const cache = await caches.open(name);
    for (const req of await cache.keys()) if (req.url.includes(modelId)) await cache.delete(req);
  }
  await refreshCached();
}

/* ------------------------------------------------------------------ */
/*  Generación                                                         */
/* ------------------------------------------------------------------ */

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
  busy++;
  clearTimeout(idleTimer);
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
    busy--;
    scheduleIdleUnload();
  }
}
