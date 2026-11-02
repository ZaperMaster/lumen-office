/*
 * Corrector ortográfico en español. El diccionario vive en un worker que se
 * crea la primera vez que hace falta. Las palabras ya revisadas se recuerdan.
 */

const DICT_KEY = "lumen.dict";

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, (data: unknown) => void>();
const known = new Map<string, boolean>();
const ignored = new Set<string>();
const listeners = new Set<() => void>();

function personal(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DICT_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./spellWorker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<{ id: number }>) => {
      pending.get(e.data.id)?.(e.data);
      pending.delete(e.data.id);
    };
    const words = personal();
    if (words.length) void call({ type: "add", words });
  }
  return worker;
}

function call<T>(msg: Record<string, unknown>): Promise<T> {
  const id = ++seq;
  return new Promise((resolve) => {
    pending.set(id, resolve as (d: unknown) => void);
    getWorker().postMessage({ ...msg, id });
  });
}

/** Palabras incorrectas de una lista (con lo ya sabido, sin preguntar otra vez). */
export async function misspelled(words: string[]): Promise<Set<string>> {
  const unknown = [...new Set(words)].filter((w) => !known.has(w));
  if (unknown.length) {
    const { wrong } = await call<{ wrong: string[] }>({ type: "check", words: unknown });
    const bad = new Set(wrong);
    for (const w of unknown) known.set(w, !bad.has(w));
  }
  return new Set(words.filter((w) => known.get(w) === false && !ignored.has(w.toLowerCase())));
}

export async function suggestions(word: string): Promise<string[]> {
  const { suggestions: s } = await call<{ suggestions: string[] }>({ type: "suggest", word });
  return s;
}

/** Añade la palabra al diccionario personal (se guarda en este equipo). */
export async function addToDictionary(word: string) {
  const words = personal();
  if (!words.includes(word)) localStorage.setItem(DICT_KEY, JSON.stringify([...words, word]));
  known.set(word, true);
  await call({ type: "add", words: [word] });
  listeners.forEach((l) => l());
}

/** No marca más esa palabra durante esta sesión. */
export function ignoreWord(word: string) {
  ignored.add(word.toLowerCase());
  listeners.forEach((l) => l());
}

/** Avisa cuando cambia el diccionario (para volver a revisar). */
export function onDictionaryChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
