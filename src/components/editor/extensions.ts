import { Extension, Node, mergeAttributes, type AnyExtension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import StarterKit from "@tiptap/starter-kit";
import { TextStyleKit } from "@tiptap/extension-text-style";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import { TableKit } from "@tiptap/extension-table";
import Image from "@tiptap/extension-image";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import Typography from "@tiptap/extension-typography";
import { CharacterCount, Placeholder } from "@tiptap/extensions";

/* ------------------------------------------------------------------ */
/*  Salto de página                                                    */
/* ------------------------------------------------------------------ */

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pageBreak: { setPageBreak: () => ReturnType };
    indent: { indent: () => ReturnType; outdent: () => ReturnType };
    paragraphLineHeight: { setParagraphLineHeight: (value: string | null) => ReturnType };
    search: {
      setSearchTerm: (term: string) => ReturnType;
      setReplaceTerm: (term: string) => ReturnType;
      setCaseSensitive: (v: boolean) => ReturnType;
      nextSearchResult: () => ReturnType;
      previousSearchResult: () => ReturnType;
      replaceCurrent: () => ReturnType;
      replaceAll: () => ReturnType;
    };
  }
}

export const PageBreak = Node.create({
  name: "pageBreak",
  group: "block",
  atom: true,
  selectable: true,
  parseHTML: () => [{ tag: "div[data-page-break]" }, { tag: 'div[style*="page-break-after"]' }],
  renderHTML: ({ HTMLAttributes }) => [
    "div",
    mergeAttributes(HTMLAttributes, { "data-page-break": "", class: "page-break", style: "page-break-after: always" }),
  ],
  addCommands() {
    return {
      setPageBreak:
        () =>
        ({ chain }) =>
          chain().insertContent([{ type: this.name }, { type: "paragraph" }]).run(),
    };
  },
  addKeyboardShortcuts() {
    return { "Mod-Enter": () => this.editor.commands.setPageBreak() };
  },
});

/* ------------------------------------------------------------------ */
/*  Sangría de párrafos y títulos                                      */
/* ------------------------------------------------------------------ */

const MAX_INDENT = 8;

export const Indent = Extension.create({
  name: "indent",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading"],
        attributes: {
          indent: {
            default: 0,
            parseHTML: (el) => {
              const m = (el as HTMLElement).style.marginLeft.match(/([\d.]+)em/);
              return m ? Math.round(parseFloat(m[1]) / 2) : 0;
            },
            renderHTML: (attrs) => (attrs.indent ? { style: `margin-left: ${attrs.indent * 2}em` } : {}),
          },
        },
      },
    ];
  },
  addCommands() {
    const change =
      (delta: number) =>
      ({ tr, state, dispatch }: { tr: import("@tiptap/pm/state").Transaction; state: import("@tiptap/pm/state").EditorState; dispatch?: (tr: import("@tiptap/pm/state").Transaction) => void }) => {
        const { from, to } = state.selection;
        let changed = false;
        state.doc.nodesBetween(from, to, (node, pos) => {
          if (node.type.name === "paragraph" || node.type.name === "heading") {
            const next = Math.max(0, Math.min(MAX_INDENT, (node.attrs.indent ?? 0) + delta));
            if (next !== node.attrs.indent) {
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next });
              changed = true;
            }
            return false;
          }
          return true;
        });
        if (changed && dispatch) dispatch(tr);
        return changed;
      };
    return {
      indent: () => change(1),
      outdent: () => change(-1),
    };
  },
  addKeyboardShortcuts() {
    return {
      Tab: () => {
        if (this.editor.isActive("listItem") || this.editor.isActive("taskItem") || this.editor.isActive("table")) return false;
        return this.editor.commands.indent();
      },
      "Shift-Tab": () => {
        if (this.editor.isActive("listItem") || this.editor.isActive("taskItem") || this.editor.isActive("table")) return false;
        return this.editor.commands.outdent();
      },
    };
  },
});

/* ------------------------------------------------------------------ */
/*  Interlineado por párrafo                                           */
/* ------------------------------------------------------------------ */

export const ParagraphLineHeight = Extension.create({
  name: "paragraphLineHeight",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading"],
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (el) => (el as HTMLElement).style.lineHeight || null,
            renderHTML: (attrs) => (attrs.lineHeight ? { style: `line-height: ${attrs.lineHeight}` } : {}),
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setParagraphLineHeight:
        (value) =>
        ({ commands }) =>
          ["paragraph", "heading"].map((t) => commands.updateAttributes(t, { lineHeight: value })).some(Boolean),
    };
  },
});

/* ------------------------------------------------------------------ */
/*  Buscar y reemplazar                                                */
/* ------------------------------------------------------------------ */

export interface SearchStorage {
  term: string;
  replace: string;
  caseSensitive: boolean;
  results: { from: number; to: number }[];
  index: number;
}

const searchKey = new PluginKey<DecorationSet>("lumen-search");

function findMatches(doc: import("@tiptap/pm/model").Node, term: string, caseSensitive: boolean) {
  const results: { from: number; to: number }[] = [];
  if (!term) return results;
  const needle = caseSensitive ? term : term.toLowerCase();
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    // Une los nodos de texto del bloque para encontrar coincidencias que crucen marcas
    let text = "";
    const map: number[] = [];
    node.forEach((child, offset) => {
      if (child.isText) {
        for (let i = 0; i < child.text!.length; i++) map.push(pos + 1 + offset + i);
        text += child.text;
      } else {
        map.push(-1);
        text += "￼";
      }
    });
    const hay = caseSensitive ? text : text.toLowerCase();
    let i = hay.indexOf(needle);
    while (i !== -1) {
      const from = map[i];
      const to = map[i + needle.length - 1] + 1;
      if (from >= 0 && to > from) results.push({ from, to });
      i = hay.indexOf(needle, i + needle.length);
    }
    return false;
  });
  return results;
}

function getSearch(editor: Editor): SearchStorage {
  return (editor.storage as unknown as { search: SearchStorage }).search;
}

export const Search = Extension.create<object, SearchStorage>({
  name: "search",
  addStorage: () => ({ term: "", replace: "", caseSensitive: false, results: [], index: 0 }),
  addCommands() {
    // Los comandos modifican la transacción que les da Tiptap (nunca despachan otra),
    // y el plugin recalcula los resultados y las decoraciones al aplicarla.
    const reveal = (editor: Editor) =>
      requestAnimationFrame(() => {
        const s = getSearch(editor);
        const r = s.results[s.index];
        if (!r) return;
        const dom = editor.view.domAtPos(r.from).node as HTMLElement;
        (dom.nodeType === 1 ? dom : dom.parentElement)?.scrollIntoView({ block: "center", behavior: "smooth" });
      });
    const step = (editor: Editor, tr: import("@tiptap/pm/state").Transaction, delta: number) => {
      const s = getSearch(editor);
      if (!s.results.length) return false;
      s.index = (s.index + delta + s.results.length) % s.results.length;
      tr.setMeta(searchKey, "refresh");
      reveal(editor);
      return true;
    };
    return {
      setSearchTerm:
        (term) =>
        ({ editor, tr }) => {
          const s = getSearch(editor);
          s.term = term;
          s.index = 0;
          tr.setMeta(searchKey, "recompute");
          reveal(editor);
          return true;
        },
      setReplaceTerm:
        (term) =>
        ({ editor }) => {
          getSearch(editor).replace = term;
          return true;
        },
      setCaseSensitive:
        (v) =>
        ({ editor, tr }) => {
          getSearch(editor).caseSensitive = v;
          tr.setMeta(searchKey, "recompute");
          return true;
        },
      nextSearchResult:
        () =>
        ({ editor, tr }) =>
          step(editor, tr, 1),
      previousSearchResult:
        () =>
        ({ editor, tr }) =>
          step(editor, tr, -1),
      replaceCurrent:
        () =>
        ({ editor, tr, dispatch }) => {
          const s = getSearch(editor);
          const r = s.results[s.index];
          if (!r) return false;
          if (dispatch) {
            if (s.replace) tr.insertText(s.replace, r.from, r.to);
            else tr.delete(r.from, r.to);
          }
          return true;
        },
      replaceAll:
        () =>
        ({ editor, tr, dispatch }) => {
          const s = getSearch(editor);
          if (!s.results.length) return false;
          if (dispatch) {
            // De atrás hacia delante para no desplazar las posiciones
            for (const r of [...s.results].reverse()) {
              if (s.replace) tr.insertText(s.replace, r.from, r.to);
              else tr.delete(r.from, r.to);
            }
          }
          return true;
        },
    };
  },
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key: searchKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, old) {
            const s = getSearch(editor);
            const meta = tr.getMeta(searchKey);
            if (!s.term) {
              s.results = [];
              return DecorationSet.empty;
            }
            if (tr.docChanged || meta === "recompute") {
              s.results = findMatches(tr.doc, s.term, s.caseSensitive);
              if (s.index >= s.results.length) s.index = 0;
            } else if (!meta) return old.map(tr.mapping, tr.doc);
            return DecorationSet.create(
              tr.doc,
              s.results.map((r, i) =>
                Decoration.inline(r.from, r.to, { class: i === s.index ? "search-match search-match-current" : "search-match" }),
              ),
            );
          },
        },
        props: {
          decorations(state) {
            return searchKey.getState(state);
          },
        },
      }),
    ];
  },
});

/* ------------------------------------------------------------------ */
/*  Conjunto de extensiones                                            */
/* ------------------------------------------------------------------ */

export function buildExtensions(opts: { placeholder: string; smartTyping: boolean }): AnyExtension[] {
  const exts: AnyExtension[] = [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4] },
      link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
      dropcursor: { color: "var(--accent)", width: 2 },
    }),
    TextStyleKit.configure({ lineHeight: false }),
    TextAlign.configure({ types: ["heading", "paragraph"], alignments: ["left", "center", "right", "justify"] }),
    Highlight.configure({ multicolor: true }),
    TableKit.configure({ table: { resizable: true, cellMinWidth: 60 } }),
    Image.configure({ allowBase64: true, inline: false }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Subscript,
    Superscript,
    CharacterCount,
    Placeholder.configure({ placeholder: opts.placeholder }),
    PageBreak,
    Indent,
    ParagraphLineHeight,
    Search,
  ];
  if (opts.smartTyping) exts.push(Typography.configure({ openDoubleQuote: "«", closeDoubleQuote: "»" }));
  return exts;
}
