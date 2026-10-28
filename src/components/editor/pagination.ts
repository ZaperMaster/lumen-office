import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import type { HeaderFooter } from "@/lib/pageLayout";

/*
 * Paginación como en Word: el documento se reparte en hojas separadas.
 *
 * El contenido sigue siendo un único documento; entre página y página se inserta
 * un separador (decoración) que contiene: el hueco libre del final de la página,
 * el pie, el espacio gris entre hojas y el encabezado de la siguiente.
 * Los párrafos que no caben se parten por líneas.
 *
 * Cómo se calcula: se quitan los separadores, se mide la posición de cada bloque
 * (en píxeles sin zoom) y se decide dónde cortar. Todo ocurre en el mismo
 * fotograma, sin parpadeos.
 */

export interface PaginationConfig {
  /** Alto de la hoja, margen superior e inferior y hueco entre hojas (px sin zoom) */
  pageHeight: number;
  marginTop: number;
  marginBottom: number;
  gap: number;
  /** Textos de encabezado y pie ya resueltos para la página `index` */
  texts: (index: number, pages: number) => { header: HeaderFooter; footer: HeaderFooter };
}

export interface PaginationStorage {
  enabled: boolean;
  config: PaginationConfig | null;
  /** Se llama con el número de páginas y lo que ocupa el contenido de la última */
  onLayout: ((pages: number, lastUsed: number) => void) | null;
  /** Doble clic en un encabezado o pie */
  onEditHeaderFooter: ((zone: "header" | "footer") => void) | null;
  /** Fuerza un nuevo cálculo (al cambiar la página, el zoom, el encabezado…) */
  refresh: () => void;
}

const key = new PluginKey<DecorationSet>("lumen-pagination");

interface PageBreak {
  pos: number;
  /** Corte dentro de un párrafo (entre dos líneas) */
  inline: boolean;
  /** Espacio que queda libre al final de la página */
  unused: number;
}

/** Fila de encabezado o pie con sus tres partes. */
export function hfRow(hf: HeaderFooter): HTMLElement {
  const row = document.createElement("span");
  row.className = "hf-row";
  for (const slot of ["left", "center", "right"] as const) {
    const cell = document.createElement("span");
    cell.className = `hf-cell hf-${slot}`;
    cell.textContent = hf[slot];
    row.appendChild(cell);
  }
  return row;
}

/**
 * Un separador dentro de un párrafo sangrado (p. ej. en una lista) empieza más a la
 * derecha que el texto normal: se alinean sus filas de encabezado y pie con el
 * ancho completo del documento.
 */
function alignToColumn(el: HTMLElement, root: HTMLElement) {
  requestAnimationFrame(() => {
    if (!el.isConnected) return;
    const zoom = root.offsetWidth ? root.getBoundingClientRect().width / root.offsetWidth : 1;
    const dx = (el.getBoundingClientRect().left - root.getBoundingClientRect().left) / zoom;
    for (const row of el.querySelectorAll<HTMLElement>(".hf-row")) {
      row.style.marginLeft = `${-dx}px`;
      row.style.width = `${root.clientWidth}px`;
    }
  });
}

function spacerDom(root: HTMLElement, cfg: PaginationConfig, index: number, pages: number, unused: number): HTMLElement {
  // Se usan <span> con display:block porque el separador puede ir dentro de un párrafo
  const el = document.createElement("span");
  el.className = "page-spacer";
  el.contentEditable = "false";
  const part = (cls: string, height: number) => {
    const p = document.createElement("span");
    p.className = cls;
    p.style.height = `${Math.max(0, height)}px`;
    el.appendChild(p);
    return p;
  };
  part("ps-unused", unused);
  const footer = part("ps-footer hf-zone", cfg.marginBottom);
  footer.dataset.zone = "footer";
  footer.appendChild(hfRow(cfg.texts(index, pages).footer));
  part("ps-gap", cfg.gap);
  const header = part("ps-header hf-zone", cfg.marginTop);
  header.dataset.zone = "header";
  header.appendChild(hfRow(cfg.texts(index + 1, pages).header));
  alignToColumn(el, root);
  return el;
}

/** Margen superior real de un bloque (forma parte del final de la página anterior). */
function marginTop(el: HTMLElement): number {
  return parseFloat(getComputedStyle(el).marginTop) || 0;
}

/**
 * Busca, dentro del bloque que se sale de la página, la posición donde empieza
 * la línea que ya no cabe. Devuelve null si no se puede partir (tabla, imagen…).
 */
function lineBreakPos(view: EditorView, rootRect: DOMRect, zoom: number, boundary: number, from: number, to: number) {
  const hit = view.posAtCoords({ left: rootRect.left + 4 * zoom, top: rootRect.top + boundary * zoom - 1 });
  if (!hit || hit.pos <= from || hit.pos >= to) return null;
  const $pos = view.state.doc.resolve(hit.pos);
  if (!$pos.parent.isTextblock) return null;
  const start = $pos.start();
  let p = hit.pos;
  const lineTop = view.coordsAtPos(p, 1).top;
  // Retrocede hasta el principio de esa línea
  for (let i = 0; i < 400 && p > start; i++) {
    const prev = view.coordsAtPos(p - 1, 1);
    if (prev.top < lineTop - 2) break;
    p -= 1;
  }
  if (p <= start) return null; // es la primera línea: mejor pasar el bloque entero
  const caret = view.coordsAtPos(p, 1);
  const dom = view.domAtPos(p).node;
  const blockEl = (dom.nodeType === 1 ? dom : dom.parentElement) as HTMLElement;
  const lh = parseFloat(getComputedStyle(blockEl).lineHeight);
  const caretH = caret.bottom - caret.top;
  // Parte superior de la caja de la línea (el cursor no incluye el interlineado)
  const lineBoxTop = caret.top - (Number.isFinite(lh) ? Math.max(0, (lh * zoom - caretH) / 2) : 0);
  return { pos: p, top: (lineBoxTop - rootRect.top) / zoom };
}

function computeBreaks(view: EditorView, cfg: PaginationConfig): { breaks: PageBreak[]; lastUsed: number } {
  const root = view.dom as HTMLElement;
  const rootRect = root.getBoundingClientRect();
  const zoom = root.offsetWidth ? rootRect.width / root.offsetWidth : 1;
  const H = cfg.pageHeight - cfg.marginTop - cfg.marginBottom;
  const breaks: PageBreak[] = [];
  let pageStart = 0;
  let lastBottom = 0;

  view.state.doc.forEach((node, offset) => {
    const el = view.nodeDOM(offset);
    if (!(el instanceof HTMLElement)) return;
    const top = el.offsetTop - marginTop(el);
    const bottom = el.offsetTop + el.offsetHeight;
    lastBottom = Math.max(lastBottom, bottom);

    // Salto de página manual: lo que sigue empieza en la página siguiente
    if (node.type.name === "pageBreak") {
      breaks.push({ pos: offset + node.nodeSize, inline: false, unused: pageStart + H - bottom });
      pageStart = bottom;
      return;
    }

    let guard = 0;
    while (bottom - pageStart > H + 0.5 && guard++ < 500) {
      const boundary = pageStart + H;
      const line = lineBreakPos(view, rootRect, zoom, boundary, offset, offset + node.nodeSize);
      if (line && line.top > pageStart + 1 && line.top <= boundary + 0.5) {
        breaks.push({ pos: line.pos, inline: true, unused: boundary - line.top });
        pageStart = line.top;
      } else if (top - pageStart > 1) {
        // No se puede partir (o es su primera línea): el bloque entero pasa a la página siguiente
        breaks.push({ pos: offset, inline: false, unused: boundary - top });
        pageStart = top;
      } else {
        // Bloque más alto que una página (tabla o imagen enorme): se deja que ocupe lo que necesite
        pageStart = bottom;
        break;
      }
    }
  });
  return { breaks, lastUsed: Math.max(0, lastBottom - pageStart) };
}

export const Pagination = Extension.create<object, PaginationStorage>({
  name: "pagination",

  addStorage() {
    return { enabled: false, config: null, onLayout: null, onEditHeaderFooter: null, refresh: () => {} };
  },

  addProseMirrorPlugins() {
    const storage = this.storage;
    return [
      new Plugin<DecorationSet>({
        key,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, set) {
            const meta = tr.getMeta(key) as DecorationSet | undefined;
            return meta ?? set.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations: (state: EditorState) => key.getState(state),
          handleDOMEvents: {
            dblclick: (_view, event) => {
              const zone = (event.target as HTMLElement).closest?.(".hf-zone") as HTMLElement | null;
              if (!zone || !storage.onEditHeaderFooter) return false;
              storage.onEditHeaderFooter(zone.dataset.zone === "footer" ? "footer" : "header");
              return true;
            },
          },
        },
        view(view) {
          let frame = 0;
          let timer: ReturnType<typeof setTimeout> | undefined;
          let lastSignature = "";

          const run = () => {
            cancelAnimationFrame(frame);
            clearTimeout(timer);
            frame = 0;
            timer = undefined;
            if (view.isDestroyed) return;
            const cfg = storage.config;
            const current = key.getState(view.state) ?? DecorationSet.empty;
            if (!storage.enabled || !cfg) {
              if (current !== DecorationSet.empty) view.dispatch(view.state.tr.setMeta(key, DecorationSet.empty).setMeta("addToHistory", false));
              lastSignature = "";
              storage.onLayout?.(1, 0);
              return;
            }
            const scroller = view.dom.closest(".print-area") as HTMLElement | null;
            const scrollTop = scroller?.scrollTop ?? 0;
            // 1) Sin separadores, para medir las posiciones naturales
            if (current.find().length) view.dispatch(view.state.tr.setMeta(key, DecorationSet.empty).setMeta("addToHistory", false));
            // 2) Medir y decidir los cortes
            const { breaks, lastUsed } = computeBreaks(view, cfg);
            const pages = breaks.length + 1;
            // 3) Volver a poner los separadores
            const decos = breaks.map((b, i) =>
              Decoration.widget(b.pos, () => spacerDom(view.dom as HTMLElement, cfg, i, pages, b.unused), {
                side: -1,
                ignoreSelection: true,
                key: `pg-${i}-${pages}-${Math.round(b.unused * 10)}-${b.inline ? "i" : "b"}`,
              }),
            );
            view.dispatch(view.state.tr.setMeta(key, DecorationSet.create(view.state.doc, decos)).setMeta("addToHistory", false));
            if (scroller) scroller.scrollTop = scrollTop;
            const signature = `${pages}|${Math.round(lastUsed)}`;
            if (signature !== lastSignature) {
              lastSignature = signature;
              storage.onLayout?.(pages, lastUsed);
            }
          };

          const schedule = () => {
            if (frame || timer) return;
            // Normalmente en el siguiente fotograma; si la ventana está oculta y no llegan
            // fotogramas, igualmente a los 100 ms
            frame = requestAnimationFrame(run);
            timer = setTimeout(run, 100);
          };
          storage.refresh = () => {
            lastSignature = "";
            schedule();
          };

          // Cambios de tamaño (imágenes que terminan de cargar, fuentes, ancho…)
          const ro = new ResizeObserver(schedule);
          ro.observe(view.dom);
          void document.fonts?.ready.then(schedule);
          schedule();

          return {
            update(v, prev: EditorState) {
              // Solo cuando cambia el documento: los cambios de separadores no recalculan
              if (v.state.doc !== prev.doc) schedule();
            },
            destroy() {
              cancelAnimationFrame(frame);
              clearTimeout(timer);
              ro.disconnect();
            },
          };
        },
      }),
    ];
  },
});
