import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";
import { misspelled, onDictionaryChange } from "@/lib/spell";
import { useSettings } from "@/store/settings";

/*
 * Subraya en rojo las palabras que no están en el diccionario español.
 * Se revisa medio segundo después de dejar de escribir.
 */

export const spellKey = new PluginKey<DecorationSet>("lumen-spell");
const WORD = /[\p{L}]+(?:['’-][\p{L}]+)*/gu;

function collect(doc: PMNode): { word: string; from: number; to: number }[] {
  const out: { word: string; from: number; to: number }[] = [];
  doc.descendants((node, pos, parent) => {
    if (parent?.type.name === "codeBlock") return false;
    if (!node.isText || !node.text) return true;
    if (node.marks.some((m) => m.type.name === "code" || m.type.name === "link")) return false;
    for (const m of node.text.matchAll(WORD)) {
      const w = m[0];
      // Siglas (ONU), palabras de una letra y nombres con mayúsculas por medio (iPhone) no se revisan
      if (w.length < 2 || (w === w.toUpperCase() && w.length <= 6) || /\p{Ll}\p{Lu}/u.test(w)) continue;
      out.push({ word: w, from: pos + m.index!, to: pos + m.index! + w.length });
    }
    return false;
  });
  return out;
}

export const SpellCheck = Extension.create({
  name: "spellCheck",

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: spellKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, set) {
            const meta = tr.getMeta(spellKey) as DecorationSet | undefined;
            if (meta) return meta;
            // Al escribir, la palabra que se toca deja de marcarse hasta la próxima revisión
            let next = set.map(tr.mapping, tr.doc);
            if (tr.docChanged) {
              const { from, to } = tr.selection;
              next = next.remove(next.find(Math.max(0, from - 1), to + 1));
            }
            return next;
          },
        },
        props: {
          decorations: (state) => spellKey.getState(state),
        },
        view(view) {
          let timer: ReturnType<typeof setTimeout> | undefined;
          let run = 0;
          const check = async () => {
            const id = ++run;
            if (!useSettings.getState().spellcheck) {
              view.dispatch(view.state.tr.setMeta(spellKey, DecorationSet.empty).setMeta("addToHistory", false));
              return;
            }
            const doc = view.state.doc;
            const words = collect(doc);
            const bad = await misspelled(words.map((w) => w.word));
            // Si el documento cambió mientras tanto, se espera a la siguiente revisión
            if (id !== run || view.isDestroyed || view.state.doc !== doc) return;
            const decos = words.filter((w) => bad.has(w.word)).map((w) => Decoration.inline(w.from, w.to, { class: "spell-error" }, { word: w.word }));
            view.dispatch(view.state.tr.setMeta(spellKey, DecorationSet.create(doc, decos)).setMeta("addToHistory", false));
          };
          const schedule = (ms = 500) => {
            clearTimeout(timer);
            timer = setTimeout(() => void check(), ms);
          };
          schedule(800);
          const offDict = onDictionaryChange(() => schedule(0));
          const offSettings = useSettings.subscribe((s, prev) => {
            if (s.spellcheck !== prev.spellcheck) schedule(0);
          });
          return {
            update(v, prev) {
              if (v.state.doc !== prev.doc) schedule();
            },
            destroy() {
              clearTimeout(timer);
              offDict();
              offSettings();
            },
          };
        },
      }),
    ];
  },
});
