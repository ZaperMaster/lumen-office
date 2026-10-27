import type { ChatMsg } from "@/lib/localModels";

interface StreamArgs {
  system: string;
  messages: ChatMsg[];
  signal?: AbortSignal;
  temperature?: number;
  onText?: (delta: string, full: string) => void;
}

/** Lee una respuesta en streaming línea a línea (NDJSON o Server-Sent Events). */
async function readLines(res: Response, signal: AbortSignal | undefined, onLine: (line: string) => void) {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) if (line.trim()) onLine(line.trim());
    }
    if (buffer.trim()) onLine(buffer.trim());
  } catch (e) {
    if (!signal?.aborted) throw e;
  }
}

/* ------------------------------------------------------------------ */
/*  Ollama (servidor local)                                            */
/* ------------------------------------------------------------------ */

export async function listOllamaModels(baseUrl: string): Promise<string[]> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/tags`);
  if (!res.ok) throw new Error(`Ollama respondió ${res.status}`);
  const data = (await res.json()) as { models?: { name: string }[] };
  return (data.models ?? []).map((m) => m.name);
}

export async function streamOllama(opts: StreamArgs & { baseUrl: string; model: string; keepAliveMinutes: number }): Promise<string> {
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
        options: { temperature: opts.temperature ?? 0.6, num_ctx: 8192 },
        // Ollama libera el modelo de la memoria tras este tiempo sin uso (-1 = nunca)
        keep_alive: opts.keepAliveMinutes > 0 ? `${opts.keepAliveMinutes}m` : -1,
      }),
      signal: opts.signal,
    });
  } catch (e) {
    if (opts.signal?.aborted) return "";
    throw new Error("No se pudo conectar con Ollama. ¿Está abierto en este equipo?", { cause: e });
  }
  if (!res.ok || !res.body) throw new Error(`Ollama respondió con un error (${res.status}).`);
  let full = "";
  await readLines(res, opts.signal, (line) => {
    const data = JSON.parse(line) as { message?: { content?: string }; error?: string };
    if (data.error) throw new Error(`Ollama: ${data.error}`);
    const delta = data.message?.content ?? "";
    if (delta) {
      full += delta;
      opts.onText?.(delta, full);
    }
  });
  return full;
}

/* ------------------------------------------------------------------ */
/*  API compatible con OpenAI (OpenAI, OpenRouter, Groq, DeepSeek…)    */
/* ------------------------------------------------------------------ */

function httpError(status: number, body: string): Error {
  let detail = "";
  try {
    const j = JSON.parse(body) as { error?: { message?: string } | string; message?: string };
    detail = typeof j.error === "string" ? j.error : (j.error?.message ?? j.message ?? "");
  } catch {
    detail = body.slice(0, 200);
  }
  if (status === 401 || status === 403) return new Error("La clave de API no es válida o no tiene permiso. Revísala en Configuración.");
  if (status === 404) return new Error(`No se encontró el modelo o la dirección de la API. ${detail}`.trim());
  if (status === 429) return new Error("Límite de uso de la API alcanzado. Inténtalo en unos segundos.");
  return new Error(`La API respondió con un error (${status}). ${detail}`.trim());
}

function connectionError(e: unknown): Error {
  return new Error(
    "No se pudo conectar con la API. Comprueba la dirección y la conexión a internet (algunos servicios no permiten conexiones directas desde aplicaciones de escritorio).",
    { cause: e },
  );
}

export async function listOpenAIModels(baseUrl: string, apiKey: string): Promise<string[]> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {} });
  } catch (e) {
    throw connectionError(e);
  }
  if (!res.ok) throw httpError(res.status, await res.text());
  const data = (await res.json()) as { data?: { id: string }[] };
  return (data.data ?? []).map((m) => m.id).sort((a, b) => a.localeCompare(b));
}

export async function streamOpenAI(opts: StreamArgs & { baseUrl: string; apiKey: string; model: string }): Promise<string> {
  if (!opts.model) throw new Error("Indica el modelo de la API en Configuración → Inteligencia artificial.");
  let res: Response;
  try {
    res = await fetch(`${opts.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: opts.model,
        stream: true,
        messages: [{ role: "system", content: opts.system }, ...opts.messages],
        ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
      }),
      signal: opts.signal,
    });
  } catch (e) {
    if (opts.signal?.aborted) return "";
    throw connectionError(e);
  }
  if (!res.ok || !res.body) throw httpError(res.status, await res.text());
  let full = "";
  await readLines(res, opts.signal, (line) => {
    if (!line.startsWith("data:")) return;
    const payload = line.slice(5).trim();
    if (payload === "[DONE]") return;
    const data = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[]; error?: { message?: string } };
    if (data.error) throw new Error(`API: ${data.error.message ?? "error desconocido"}`);
    const delta = data.choices?.[0]?.delta?.content ?? "";
    if (delta) {
      full += delta;
      opts.onText?.(delta, full);
    }
  });
  return full;
}

/* ------------------------------------------------------------------ */
/*  Anthropic (Claude), con el SDK oficial                             */
/* ------------------------------------------------------------------ */

export async function streamAnthropic(opts: StreamArgs & { apiKey: string; model: string; effort: "low" | "medium" }): Promise<string> {
  if (!opts.apiKey) throw new Error("Añade tu clave de API de Anthropic en Configuración → Inteligencia artificial.");
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  // La clave la introduce el propio usuario y solo se guarda en este equipo.
  const client = new Anthropic({ apiKey: opts.apiKey, dangerouslyAllowBrowser: true });
  // El respaldo automático ante rechazos de seguridad existe en Opus 5.5 y Sonnet 5.5
  const withFallback = opts.model === "claude-opus-5-5" || opts.model === "claude-sonnet-5-5";
  let full = "";
  try {
    const stream = client.beta.messages.stream(
      {
        model: opts.model,
        max_tokens: 64000,
        system: opts.system,
        messages: opts.messages,
        output_config: { effort: opts.effort },
        ...(withFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      },
      { signal: opts.signal },
    );
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        full += event.delta.text;
        opts.onText?.(event.delta.text, full);
      }
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") throw new Error("El modelo no puede ayudar con esta petición.");
    return full;
  } catch (e) {
    if (opts.signal?.aborted) return full;
    if (e instanceof Anthropic.AuthenticationError) throw new Error("La clave de API de Anthropic no es válida. Revísala en Configuración.");
    if (e instanceof Anthropic.PermissionDeniedError) throw new Error("Tu clave no tiene permiso para usar este modelo.");
    if (e instanceof Anthropic.NotFoundError) throw new Error("Modelo de Anthropic no disponible. Elige otro en Configuración.");
    if (e instanceof Anthropic.RateLimitError) throw new Error("Límite de uso alcanzado. Inténtalo en unos segundos.");
    if (e instanceof Anthropic.APIConnectionError) throw new Error("No hay conexión con la API de Anthropic.");
    if (e instanceof Anthropic.APIError) throw new Error(`Error de la API de Anthropic (${e.status ?? "?"}).`);
    throw e;
  }
}
