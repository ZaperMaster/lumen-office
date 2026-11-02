/// <reference lib="webworker" />
import NSpell from "nspell";
// Diccionario español de Hunspell (licencia MPL/LGPL/GPL a elegir)
import aff from "../../node_modules/dictionary-es/index.aff?raw";
import dic from "../../node_modules/dictionary-es/index.dic?raw";

/*
 * Corrector ortográfico en segundo plano: cargar el diccionario tarda un poco
 * y así no se nota al escribir.
 */

type Msg =
  | { id: number; type: "check"; words: string[] }
  | { id: number; type: "suggest"; word: string }
  | { id: number; type: "add"; words: string[] };

const spell = NSpell(aff, dic);

self.onmessage = (e: MessageEvent<Msg>) => {
  const m = e.data;
  if (m.type === "add") {
    for (const w of m.words) spell.add(w);
    self.postMessage({ id: m.id, ok: true });
  } else if (m.type === "check") {
    // Se devuelven las palabras que no están en el diccionario
    const wrong = m.words.filter((w) => !spell.correct(w) && !spell.correct(w.toLowerCase()));
    self.postMessage({ id: m.id, wrong });
  } else {
    self.postMessage({ id: m.id, suggestions: spell.suggest(m.word).slice(0, 6) });
  }
};
