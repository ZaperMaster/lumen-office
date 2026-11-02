import { Node, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { liftTarget } from "@tiptap/pm/transform";
import type { Node as PMNode } from "@tiptap/pm/model";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChartSvg, type ChartData } from "@/components/sheet/Chart";
import { DocChartView } from "@/components/editor/DocChartView";
import type { ChartType } from "@/lib/sheet/model";

/*
 * Elementos de documento como en Word: gráficos, cuadros de texto,
 * notas al pie y texto en columnas.
 */

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    docBlocks: {
      insertDocChart: (chart: DocChart) => ReturnType;
      setCallout: (kind: CalloutKind) => ReturnType;
      unsetCallout: () => ReturnType;
      setColumns: (count: number) => ReturnType;
      insertFootnote: () => ReturnType;
    };
  }
}

/* ---------------- Gráficos ---------------- */

export interface DocChart extends ChartData {
  type: ChartType;
  title: string;
  width: number;
  legend: boolean;
}

export const SAMPLE_CHART: DocChart = {
  type: "column",
  title: "Ventas por trimestre",
  width: 560,
  legend: true,
  categories: ["T1", "T2", "T3", "T4"],
  series: [
    { name: "2025", values: [120, 150, 170, 210] },
    { name: "2026", values: [140, 180, 190, 240] },
  ],
};

export const chartHeight = (c: DocChart) => Math.round(c.width * 0.6);

/** El gráfico como SVG independiente (para HTML, Word y PDF). */
export function chartSvg(c: DocChart): string {
  const svg = renderToStaticMarkup(createElement(ChartSvg, { type: c.type, data: c, width: c.width, height: chartHeight(c), title: c.title || undefined, legend: c.legend }));
  // Fuera del editor no hay color heredado: texto gris oscuro y fondo blanco
  return svg.replace(/currentColor/g, "#33363f").replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg" style="background:#fff;font-family:Segoe UI,Arial,sans-serif"');
}

export const chartSvgUrl = (c: DocChart) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(chartSvg(c))}`;

function parseChart(raw: string | null): DocChart | null {
  try {
    const c = JSON.parse(raw ?? "") as DocChart;
    return Array.isArray(c.categories) && Array.isArray(c.series) ? { ...SAMPLE_CHART, ...c } : null;
  } catch {
    return null;
  }
}

export const DocChartNode = Node.create({
  name: "docChart",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      chart: {
        default: SAMPLE_CHART,
        parseHTML: (el) => parseChart(el.getAttribute("data-chart")) ?? SAMPLE_CHART,
        renderHTML: (a) => ({ "data-chart": JSON.stringify(a.chart) }),
      },
    };
  },
  // Antes que las imágenes normales (también es un <img>)
  parseHTML: () => [{ tag: "img[data-chart]", priority: 100 }],
  renderHTML: ({ node, HTMLAttributes }) => {
    const c = node.attrs.chart as DocChart;
    return ["img", mergeAttributes(HTMLAttributes, { src: chartSvgUrl(c), width: c.width, alt: c.title || "Gráfico", class: "doc-chart", "data-align": "center" })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(DocChartView, { className: "doc-chart-node" });
  },
  addCommands() {
    return {
      insertDocChart:
        (chart) =>
        ({ chain }) =>
          chain().insertContent([{ type: this.name, attrs: { chart } }, { type: "paragraph" }]).run(),
    };
  },
});

/* ---------------- Cuadros de texto ---------------- */

export type CalloutKind = "box" | "info" | "tip" | "warning";

export const CALLOUTS: { id: CalloutKind; label: string; fill: string; border: string }[] = [
  { id: "box", label: "Cuadro de texto", fill: "FFFFFF", border: "9AA0AE" },
  { id: "info", label: "Nota informativa", fill: "E8F0FE", border: "4F7CFF" },
  { id: "tip", label: "Consejo", fill: "E6F6EF", border: "20B486" },
  { id: "warning", label: "Atención", fill: "FEF3E2", border: "F59E0B" },
];

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return {
      kind: {
        default: "box",
        parseHTML: (el) => el.getAttribute("data-callout") || "box",
        renderHTML: (a) => ({ "data-callout": a.kind }),
      },
    };
  },
  parseHTML: () => [{ tag: "div[data-callout]" }],
  renderHTML: ({ node, HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { class: `callout callout-${node.attrs.kind}` }), 0],
  addCommands() {
    return {
      setCallout:
        (kind) =>
        ({ editor, commands }) =>
          editor.isActive(this.name) ? commands.updateAttributes(this.name, { kind }) : commands.wrapIn(this.name, { kind }),
      unsetCallout:
        () =>
        ({ commands }) =>
          commands.lift(this.name),
    };
  },
});

/* ---------------- Columnas ---------------- */

export const Columns = Node.create({
  name: "columns",
  group: "block",
  content: "block+",
  addAttributes() {
    return {
      count: {
        default: 2,
        parseHTML: (el) => Math.min(3, Math.max(2, Number(el.getAttribute("data-columns")) || 2)),
        renderHTML: (a) => ({ "data-columns": a.count, style: `column-count: ${a.count}` }),
      },
    };
  },
  parseHTML: () => [{ tag: "div[data-columns]" }],
  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { class: "doc-columns" }), 0],
  addCommands() {
    return {
      setColumns:
        (count) =>
        ({ state, tr, dispatch }) => {
          const type = state.schema.nodes.columns;
          const { $from, empty } = state.selection;
          // ¿Ya está dentro de unas columnas?
          let depth = -1;
          for (let d = $from.depth; d > 0; d--) if ($from.node(d).type === type) depth = d;
          if (depth > 0) {
            const pos = $from.before(depth);
            const node = $from.node(depth);
            if (count > 1) {
              tr.setNodeMarkup(pos, undefined, { count });
            } else {
              // Una sola columna: el texto vuelve a la página normal
              const range = tr.doc.resolve(pos + 1).blockRange(tr.doc.resolve(pos + node.nodeSize - 1), (n) => n.type === type);
              const target = range && liftTarget(range);
              if (!range || target == null) return false;
              tr.lift(range, target);
            }
            dispatch?.(tr);
            return true;
          }
          if (count < 2) return false;
          // Sin texto seleccionado se aplica a todo el documento, como en Word
          const $a = empty ? tr.doc.resolve(1) : $from;
          const $b = empty ? tr.doc.resolve(tr.doc.content.size - 1) : state.selection.$to;
          const range = $a.blockRange($b);
          if (!range) return false;
          tr.wrap(range, [{ type, attrs: { count } }]);
          dispatch?.(tr);
          return true;
        },
    };
  },
});

/* ---------------- Notas al pie ---------------- */

const notesKey = new PluginKey<DecorationSet>("lumen-footnotes");
/** La nota recién insertada abre su cuadro para escribir */
let openNext = false;

function footnotes(doc: PMNode) {
  const out: { pos: number; text: string }[] = [];
  doc.descendants((n, pos) => {
    if (n.type.name === "footnote") out.push({ pos, text: n.attrs.text as string });
  });
  return out;
}

/** Lista de notas al final del documento */
function notesWidget(doc: PMNode) {
  const notes = footnotes(doc);
  if (!notes.length) return DecorationSet.empty;
  const widget = Decoration.widget(
    doc.content.size,
    () => {
      const box = document.createElement("div");
      box.className = "footnotes-list";
      box.contentEditable = "false";
      const ol = document.createElement("ol");
      for (const n of notes) {
        const li = document.createElement("li");
        li.textContent = n.text || "(nota vacía)";
        ol.appendChild(li);
      }
      box.appendChild(ol);
      return box;
    },
    { side: 1, key: `fn-${notes.map((n) => n.text).join("\u0001")}`, ignoreSelection: true },
  );
  return DecorationSet.create(doc, [widget]);
}

export const Footnote = Node.create({
  name: "footnote",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      text: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-footnote") ?? "",
        renderHTML: (a) => ({ "data-footnote": a.text }),
      },
    };
  },
  parseHTML: () => [{ tag: "sup[data-footnote]" }],
  renderHTML: ({ node, HTMLAttributes }) => ["sup", mergeAttributes(HTMLAttributes, { class: "footnote-ref", title: node.attrs.text })],
  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement("sup");
      dom.className = "footnote-ref";
      dom.title = node.attrs.text;
      let current = node;
      // Cuadro flotante para escribir la nota
      const open = () => {
        if (!editor.isEditable) return;
        const rect = dom.getBoundingClientRect();
        const pop = document.createElement("div");
        pop.className = "footnote-pop";
        pop.style.left = `${Math.min(rect.left, window.innerWidth - 320)}px`;
        pop.style.top = `${rect.bottom + 6}px`;
        const label = document.createElement("div");
        label.textContent = "Nota al pie";
        const area = document.createElement("textarea");
        area.value = current.attrs.text;
        area.placeholder = "Escribe la nota (Intro para guardar)";
        pop.append(label, area);
        document.body.appendChild(pop);
        area.focus();
        let done = false;
        const close = (save: boolean) => {
          if (done) return;
          done = true;
          pop.remove();
          const pos = typeof getPos === "function" ? getPos() : undefined;
          if (pos === undefined) return;
          const text = area.value.trim();
          if (save && text !== current.attrs.text) editor.chain().command(({ tr }) => (tr.setNodeMarkup(pos, undefined, { text }), true)).run();
          // Una nota sin texto no sirve: se quita
          if (!text && save) editor.chain().deleteRange({ from: pos, to: pos + 1 }).run();
        };
        area.addEventListener("keydown", (e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            close(true);
          } else if (e.key === "Escape") close(!current.attrs.text);
        });
        area.addEventListener("blur", () => close(true));
      };
      dom.addEventListener("click", open);
      if (openNext) {
        openNext = false;
        setTimeout(open, 30);
      }
      return {
        dom,
        update: (n) => {
          if (n.type.name !== "footnote") return false;
          current = n;
          dom.title = n.attrs.text;
          return true;
        },
      };
    };
  },
  addCommands() {
    return {
      insertFootnote:
        () =>
        ({ chain }) => {
          openNext = true;
          return chain().insertContent({ type: this.name, attrs: { text: "" } }).run();
        },
    };
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: notesKey,
        state: {
          init: (_, state) => notesWidget(state.doc),
          apply: (tr, old) => (tr.docChanged ? notesWidget(tr.doc) : old),
        },
        props: { decorations: (state) => notesKey.getState(state) },
      }),
    ];
  },
});
