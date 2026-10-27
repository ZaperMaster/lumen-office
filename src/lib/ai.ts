import { useSettings } from "@/store/settings";
import { LOCAL_MODELS, loadEngine, loadRemote, type ChatMsg } from "@/lib/localModels";

/*
 * Tres motores de IA:
 *  - webllm: modelo local en la tarjeta gráfica (nada sale del equipo)
 *  - ollama: modelo local servido por Ollama (nada sale del equipo)
 *  - api:    API propia del usuario (OpenAI-compatible o Anthropic); el texto se envía a ese servicio
 */

export type { ChatMsg };

/** Límite de texto del documento que se pasa como contexto a los modelos locales (ventanas pequeñas). */
export const MAX_CONTEXT_CHARS = 14000;
/** Con una API remota el contexto puede ser mucho mayor. */
export const MAX_CONTEXT_CHARS_API = 200000;

export function contextLimit(): number {
  return useSettings.getState().aiEngine === "api" ? MAX_CONTEXT_CHARS_API : MAX_CONTEXT_CHARS;
}

/** ¿El motor actual mantiene los textos en el equipo? */
export function isLocalEngine(): boolean {
  return useSettings.getState().aiEngine !== "api";
}

export function currentModelName(): string {
  const s = useSettings.getState();
  if (s.aiEngine === "ollama") return s.ollamaModel ? `Ollama · ${s.ollamaModel}` : "Ollama";
  if (s.aiEngine === "api") {
    if (s.apiProvider === "anthropic") return `API · ${s.anthropicModel}`;
    return s.openaiModel ? `API · ${s.openaiModel}` : "API (sin modelo)";
  }
  return LOCAL_MODELS.find((m) => m.id === s.localModel)?.name ?? s.localModel;
}

function systemPrompt(extra?: string) {
  const { aiLanguage } = useSettings.getState();
  return [
    "Eres el asistente de escritura de Lumen Office, un procesador de textos.",
    `Responde siempre en ${aiLanguage}, salvo que se pida explícitamente otro idioma.`,
    "Cuando el usuario pida transformar o generar texto, devuelve SOLO el texto resultante, usando Markdown (listas, **negrita**, *cursiva*, tablas) cuando el contenido lo necesite, sin introducciones, explicaciones ni comentarios, y sin envolverlo en bloques de código ```.",
    extra ?? "",
  ]
    .filter(Boolean)
    .join("\n");
}

export interface StreamOptions {
  messages: ChatMsg[];
  system?: string;
  signal?: AbortSignal;
  /** Más baja = más literal (correcciones, traducciones); más alta = más creativa */
  temperature?: number;
  onText?: (delta: string, full: string) => void;
}

/** Genera la respuesta en streaming con el motor configurado y devuelve el texto completo. */
export async function streamText({ messages, system, signal, temperature, onText }: StreamOptions): Promise<string> {
  const s = useSettings.getState();
  const sys = systemPrompt(system);
  // El texto se limpia también durante el streaming para que la vista previa ya salga bien
  const onClean = onText ? (delta: string, full: string) => onText(delta, cleanOutput(full)) : undefined;
  const common = { system: sys, messages, signal, temperature, onText: onClean };
  let text: string;
  if (s.aiEngine === "webllm") {
    // Solo aquí se carga el motor local (unos 6 MB de código)
    const { streamWebLLM } = await loadEngine();
    text = await streamWebLLM({ modelId: s.localModel, ...common });
  } else {
    const remote = await loadRemote();
    if (s.aiEngine === "ollama") {
      text = await remote.streamOllama({ baseUrl: s.ollamaUrl, model: s.ollamaModel, keepAliveMinutes: s.aiUnloadMinutes, ...common });
    } else if (s.apiProvider === "anthropic") {
      // Los modelos actuales de Anthropic no admiten temperatura: se controla con el esfuerzo
      text = await remote.streamAnthropic({
        apiKey: s.anthropicKey,
        model: s.anthropicModel,
        effort: temperature !== undefined && temperature <= 0.5 ? "low" : "medium",
        ...common,
        temperature: undefined,
      });
    } else {
      text = await remote.streamOpenAI({ baseUrl: s.openaiBaseUrl, apiKey: s.openaiKey, model: s.openaiModel, ...common });
    }
  }
  return cleanOutput(text);
}

/**
 * Quita envoltorios que a veces añaden los modelos pequeños: ```markdown … ```, """ … """
 * o las etiquetas <texto>. Funciona también con respuestas a medio escribir.
 */
function cleanOutput(text: string): string {
  let t = text;
  for (let i = 0; i < 2; i++) {
    t = t
      .replace(/^\s*```(?:markdown|md|text)?[ \t]*\n?/, "")
      .replace(/\n?```\s*$/, "")
      .replace(/^\s*"""\s*\n?/, "")
      .replace(/\n?"""\s*$/, "")
      .replace(/^\s*<\/?texto>\s*\n?/i, "")
      .replace(/\n?<\/?texto>\s*$/i, "");
  }
  return t.trim();
}

/* ------------------------------------------------------------------ */
/*  Acciones rápidas sobre el texto                                    */
/* ------------------------------------------------------------------ */

export interface AIAction {
  id: string;
  label: string;
  group: "edit" | "transform" | "generate";
  /** Si es true, el resultado se añade tras la selección en lugar de sustituirla */
  insertAfter?: boolean;
  temperature?: number;
  prompt: (text: string, arg?: string) => string;
}

export const LANGUAGES = ["inglés", "español", "francés", "alemán", "italiano", "portugués", "catalán", "chino", "japonés"];
export const TONES = ["formal", "profesional", "cercano", "persuasivo", "académico", "sencillo"];

const wrap = (instruction: string, text: string) =>
  `${instruction} Conserva la estructura del original: no añadas títulos, encabezados ni secciones que no estén en él.\n\n<texto>\n${text}\n</texto>`;

export const AI_ACTIONS: AIAction[] = [
  { id: "improve", label: "Mejorar redacción", group: "edit", prompt: (t) => wrap("Mejora la redacción, claridad y fluidez de este texto manteniendo su significado y su formato.", t) },
  { id: "fix", label: "Corregir ortografía y gramática", group: "edit", temperature: 0.1, prompt: (t) => wrap("Corrige únicamente los errores de ortografía, gramática y puntuación de este texto. No cambies palabras que ya sean correctas, ni los tiempos verbales, ni el estilo, ni el contenido.", t) },
  { id: "shorter", label: "Hacer más corto", group: "edit", prompt: (t) => wrap("Reescribe este texto para que tenga aproximadamente la mitad de longitud, conservando las ideas clave.", t) },
  { id: "longer", label: "Hacer más largo", group: "edit", prompt: (t) => wrap("Amplía este texto con más detalle, ejemplos y matices, manteniendo el tono.", t) },
  { id: "simplify", label: "Simplificar", group: "edit", prompt: (t) => wrap("Reescribe este texto con lenguaje sencillo y frases cortas, fácil de entender para cualquiera.", t) },
  { id: "tone", label: "Cambiar tono", group: "transform", prompt: (t, tone) => wrap(`Reescribe este texto con un tono ${tone ?? "profesional"}.`, t) },
  { id: "translate", label: "Traducir", group: "transform", temperature: 0.2, prompt: (t, lang) => wrap(`Traduce este texto al ${lang ?? "inglés"}, conservando el formato. Devuelve únicamente la traducción.`, t) },
  { id: "bullets", label: "Convertir en lista", group: "transform", prompt: (t) => wrap("Convierte este texto en una lista de puntos clara y concisa.", t) },
  { id: "table", label: "Convertir en tabla", group: "transform", temperature: 0.2, prompt: (t) => wrap("Organiza la información de este texto en una tabla Markdown con encabezados adecuados.", t) },
  { id: "summarize", label: "Resumir", group: "generate", insertAfter: true, prompt: (t) => wrap("Escribe un resumen breve (un párrafo) de este texto. Empieza con «**Resumen:**».", t) },
  { id: "continue", label: "Continuar escribiendo", group: "generate", insertAfter: true, prompt: (t) => wrap("Continúa este texto de forma natural con uno o dos párrafos más, con el mismo estilo. Devuelve solo la continuación.", t) },
  { id: "explain", label: "Explicar", group: "generate", insertAfter: true, prompt: (t) => wrap("Explica de forma clara y breve qué significa este texto.", t) },
];

export async function runAction(action: AIAction, text: string, arg: string | undefined, opts: Omit<StreamOptions, "messages">) {
  return streamText({ temperature: action.temperature ?? 0.5, ...opts, messages: [{ role: "user", content: action.prompt(text, arg) }] });
}
