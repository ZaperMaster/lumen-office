import { Extension, Mark, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { ReplaceStep } from "@tiptap/pm/transform";
import { Fragment, type Node as PMNode } from "@tiptap/pm/model";

/*
 * Revisión de documentos como en Word:
 *  - Comentarios: una marca con el id del comentario (el texto vive en el documento guardado).
 *  - Control de cambios: lo escrito se marca como «añadido» y lo borrado no
 *    desaparece, se marca como «eliminado». Luego se acepta o se rechaza.
 */

export const CommentMark = Mark.create({
  name: "comment",
  inclusive: false,
  // Varios comentarios pueden cubrir el mismo texto
  excludes: "",
  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-comment-id"),
        renderHTML: (a) => ({ "data-comment-id": a.id }),
      },
    };
  },
  parseHTML: () => [{ tag: "span[data-comment-id]" }],
  renderHTML: ({ HTMLAttributes }) => ["span", mergeAttributes(HTMLAttributes, { class: "comment-mark" }), 0],
});

const changeAttrs = () => ({
  author: { default: "", parseHTML: (el: HTMLElement) => el.getAttribute("data-author") ?? "", renderHTML: (a: { author: string }) => ({ "data-author": a.author }) },
  date: { default: 0, parseHTML: (el: HTMLElement) => Number(el.getAttribute("data-date") ?? 0), renderHTML: (a: { date: number }) => ({ "data-date": a.date }) },
});

export const InsertionMark = Mark.create({
  name: "insertion",
  inclusive: true,
  addAttributes: changeAttrs,
  parseHTML: () => [{ tag: "ins" }],
  renderHTML: ({ HTMLAttributes }) => ["ins", mergeAttributes(HTMLAttributes, { class: "track-ins" }), 0],
});

export const DeletionMark = Mark.create({
  name: "deletion",
  inclusive: false,
  addAttributes: changeAttrs,
  parseHTML: () => [{ tag: "del" }],
  renderHTML: ({ HTMLAttributes }) => ["del", mergeAttributes(HTMLAttributes, { class: "track-del" }), 0],
});

export const trackKey = new PluginKey("lumen-track");

export interface TrackStorage {
  enabled: boolean;
  author: string;
}

export interface Change {
  type: "insertion" | "deletion";
  from: number;
  to: number;
  author: string;
  date: number;
  text: string;
}

/** Cambios del documento, juntando los trozos seguidos del mismo tipo y autor. */
export function listChanges(doc: PMNode): Change[] {
  const out: Change[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText) return true;
    for (const m of node.marks) {
      if (m.type.name !== "insertion" && m.type.name !== "deletion") continue;
      const type = m.type.name as Change["type"];
      const last = out[out.length - 1];
      if (last && last.type === type && last.author === m.attrs.author && last.to === pos) {
        last.to = pos + node.nodeSize;
        last.text += node.text;
      } else out.push({ type, from: pos, to: pos + node.nodeSize, author: m.attrs.author, date: m.attrs.date, text: node.text ?? "" });
    }
    return false;
  });
  return out;
}

/** Acepta (o rechaza) los cambios entre dos posiciones. */
function resolve(tr: Transaction, from: number, to: number, accept: boolean, only?: Change["type"]) {
  const schema = tr.doc.type.schema;
  const ins = schema.marks.insertion;
  const del = schema.marks.deletion;
  // Lo que hay que quitar del texto (de atrás hacia delante para no mover posiciones)
  const remove: [number, number][] = [];
  tr.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText) return true;
    const a = Math.max(from, pos);
    const b = Math.min(to, pos + node.nodeSize);
    if (node.marks.some((m) => m.type === del) && only !== "insertion" && accept) remove.push([a, b]);
    if (node.marks.some((m) => m.type === ins) && only !== "deletion" && !accept) remove.push([a, b]);
    return false;
  });
  if (only !== "deletion") tr.removeMark(from, to, ins);
  if (only !== "insertion") tr.removeMark(from, to, del);
  for (const [a, b] of remove.sort((x, y) => y[0] - x[0])) tr.delete(tr.mapping.map(a), tr.mapping.map(b));
  tr.setMeta(trackKey, true);
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    review: {
      setTrackChanges: (on: boolean) => ReturnType;
      acceptChange: (from: number, to: number, type: Change["type"]) => ReturnType;
      rejectChange: (from: number, to: number, type: Change["type"]) => ReturnType;
      acceptAllChanges: () => ReturnType;
      rejectAllChanges: () => ReturnType;
    };
  }
}

export const TrackChanges = Extension.create<object, TrackStorage>({
  name: "trackChanges",

  addStorage() {
    return { enabled: false, author: "" };
  },

  addCommands() {
    return {
      setTrackChanges:
        (on) =>
        () => {
          this.storage.enabled = on;
          return true;
        },
      acceptChange:
        (from, to, type) =>
        ({ tr, dispatch }) => {
          resolve(tr, from, to, true, type);
          dispatch?.(tr);
          return true;
        },
      rejectChange:
        (from, to, type) =>
        ({ tr, dispatch }) => {
          resolve(tr, from, to, false, type);
          dispatch?.(tr);
          return true;
        },
      acceptAllChanges:
        () =>
        ({ tr, dispatch }) => {
          resolve(tr, 0, tr.doc.content.size, true);
          dispatch?.(tr);
          return true;
        },
      rejectAllChanges:
        () =>
        ({ tr, dispatch }) => {
          resolve(tr, 0, tr.doc.content.size, false);
          dispatch?.(tr);
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const storage = this.storage;
    return [
      new Plugin({
        key: trackKey,
        appendTransaction(trs, oldState: EditorState, newState: EditorState) {
          if (!storage.enabled) return null;
          const changed = trs.filter((t) => t.docChanged);
          // Solo las ediciones normales (escribir, borrar, pegar); no deshacer ni lo que hace la propia revisión
          if (changed.length !== 1 || changed[0].steps.length !== 1) return null;
          const t0 = changed[0];
          if (t0.getMeta(trackKey) || t0.getMeta("history$")) return null;
          const step = t0.steps[0];
          if (!(step instanceof ReplaceStep)) return null;
          const { from, to, slice } = step as unknown as { from: number; to: number; slice: { size: number } };
          const schema = newState.schema;
          const ins = schema.marks.insertion;
          const del = schema.marks.deletion;
          if (!ins || !del) return null;
          const attrs = { author: storage.author || "Tú", date: Date.now() };
          const tr = newState.tr.setMeta(trackKey, true).setMeta("addToHistory", true);
          const insTo = from + slice.size;
          if (slice.size > 0) {
            tr.removeMark(from, insTo, del);
            tr.addMark(from, insTo, ins.create(attrs));
          }
          let kept = 0;
          if (to > from) {
            const $a = oldState.doc.resolve(from);
            const $b = oldState.doc.resolve(to);
            // Solo se conserva tachado lo borrado dentro de un mismo párrafo
            if ($a.parent === $b.parent && $a.parent.isTextblock) {
              const pieces: PMNode[] = [];
              oldState.doc.nodesBetween(from, to, (node, pos) => {
                if (!node.isText) return true;
                const a = Math.max(from, pos) - pos;
                const b = Math.min(to, pos + node.nodeSize) - pos;
                const text = node.text!.slice(a, b);
                // Lo que había escrito uno mismo con el control activado se borra de verdad
                if (!text || node.marks.some((m) => m.type === ins)) return false;
                const marks = node.marks.some((m) => m.type === del) ? node.marks : del.create(attrs).addToSet(node.marks);
                pieces.push(schema.text(text, marks));
                return false;
              });
              if (pieces.length) {
                const frag = Fragment.fromArray(pieces);
                tr.insert(from, frag);
                kept = frag.size;
              }
            }
          }
          if (!kept && slice.size === 0) return null;
          // Dónde queda el cursor: retroceso → antes de lo tachado; Supr → después; al escribir → tras lo escrito
          const oldHead = oldState.selection.head;
          const backspace = slice.size === 0 && oldHead === to && to !== from;
          const pos = slice.size > 0 ? insTo + kept : backspace ? from : from + kept;
          tr.setSelection(TextSelection.create(tr.doc, Math.min(pos, tr.doc.content.size)));
          return tr;
        },
      }),
    ];
  },
});
