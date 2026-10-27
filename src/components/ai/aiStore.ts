import { create } from "zustand";
import type { Editor } from "@tiptap/react";
import { AI_ACTIONS, runAction, type AIAction } from "@/lib/ai";
import { htmlToMarkdown, markdownToHtml } from "@/lib/io";
import { DOMSerializer } from "@tiptap/pm/model";

interface AIRun {
  status: "idle" | "running" | "done" | "error";
  label: string;
  output: string;
  error: string | null;
  range: { from: number; to: number } | null;
  insertAfter: boolean;
  lastAction: { action: AIAction; arg?: string; text: string } | null;
  controller: AbortController | null;
  panelOpen: boolean;
}

interface AIStore extends AIRun {
  run: (editor: Editor, actionId: string, arg?: string) => Promise<void>;
  retry: (editor: Editor) => Promise<void>;
  stop: () => void;
  discard: () => void;
  accept: (editor: Editor, mode: "replace" | "below") => void;
  setPanelOpen: (o: boolean) => void;
}

/** Devuelve la selección como Markdown (o el párrafo actual si no hay selección). */
export function selectionMarkdown(editor: Editor): { text: string; from: number; to: number } {
  const { state } = editor;
  let { from, to } = state.selection;
  if (from === to) {
    // Sin selección: usa el bloque donde está el cursor
    const $from = state.selection.$from;
    const depth = $from.depth > 0 ? 1 : 0;
    from = $from.start(depth) - (depth ? 1 : 0);
    to = $from.end(depth) + (depth ? 1 : 0);
  }
  const slice = state.doc.slice(from, to);
  const serializer = DOMSerializer.fromSchema(state.schema);
  const div = document.createElement("div");
  div.appendChild(serializer.serializeFragment(slice.content));
  return { text: htmlToMarkdown(div.innerHTML).trim(), from, to };
}

/** Inserta Markdown en el editor como contenido con formato. */
export function insertMarkdown(editor: Editor, md: string, at?: { from: number; to: number } | number) {
  let html = markdownToHtml(md).trim();
  // Un solo párrafo se inserta en línea, para no partir el párrafo donde está la selección
  const single = html.match(/^<p>([\s\S]*)<\/p>$/);
  if (single && !single[1].includes("<p>")) html = single[1];
  const chain = editor.chain().focus();
  if (at === undefined) chain.insertContent(html).run();
  else chain.insertContentAt(at, html).run();
}

const initial: AIRun = {
  status: "idle",
  label: "",
  output: "",
  error: null,
  range: null,
  insertAfter: false,
  lastAction: null,
  controller: null,
  panelOpen: false,
};

export const useAI = create<AIStore>((set, get) => ({
  ...initial,

  run: async (editor, actionId, arg) => {
    const action = AI_ACTIONS.find((a) => a.id === actionId);
    if (!action) return;
    get().controller?.abort();
    const sel = selectionMarkdown(editor);
    if (!sel.text) {
      set({ ...initial, panelOpen: get().panelOpen, status: "error", label: action.label, error: "Selecciona algo de texto primero." });
      return;
    }
    const controller = new AbortController();
    set({
      status: "running",
      label: arg ? `${action.label}: ${arg}` : action.label,
      output: "",
      error: null,
      range: { from: sel.from, to: sel.to },
      insertAfter: !!action.insertAfter,
      lastAction: { action, arg, text: sel.text },
      controller,
    });
    try {
      await runAction(action, sel.text, arg, {
        signal: controller.signal,
        onText: (_d, full) => set({ output: full }),
      });
      if (get().controller === controller) set({ status: "done", controller: null });
    } catch (e) {
      set({ status: "error", error: e instanceof Error ? e.message : String(e), controller: null });
    }
  },

  retry: async (editor) => {
    const last = get().lastAction;
    if (!last) return;
    const { range } = get();
    if (range) editor.commands.setTextSelection(range);
    await get().run(editor, last.action.id, last.arg);
  },

  stop: () => {
    get().controller?.abort();
    set({ status: get().output ? "done" : "idle", controller: null });
  },

  discard: () => {
    get().controller?.abort();
    set({ ...initial, panelOpen: get().panelOpen });
  },

  accept: (editor, mode) => {
    const { output, range } = get();
    if (!output.trim() || !range) return;
    // Ajusta el rango si el documento cambió entretanto
    const max = editor.state.doc.content.size;
    const from = Math.min(range.from, max);
    const to = Math.min(range.to, max);
    if (mode === "replace") {
      const original = editor.state.doc.textBetween(from, to, "\n");
      insertMarkdown(editor, output, { from, to });
      // Conserva el espacio que había al final de la selección (el modelo lo recorta)
      if (/[ \t]$/.test(original) && !output.trim().includes("\n")) editor.commands.insertContent(" ");
    } else insertMarkdown(editor, output, to);
    set({ ...initial, panelOpen: get().panelOpen });
  },

  setPanelOpen: (panelOpen) => set({ panelOpen }),
}));
