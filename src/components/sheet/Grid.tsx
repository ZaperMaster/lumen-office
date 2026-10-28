import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { FErr, formulaRefs, type Evaluator } from "@/lib/sheet/formula";
import { defaultAlign, formatValue } from "@/lib/sheet/format";
import { colName, colWidth, key, mergeAt, normRange, rangeToA1, rowHeight, type ChartSpec, type Range, type Sheet } from "@/lib/sheet/model";
import { ChartSvg, chartData } from "@/components/sheet/Chart";
import type { CondStyle } from "@/lib/sheet/view";
import { cn } from "@/components/ui";

/*
 * Cuadrícula de la hoja de cálculo. Solo se dibujan las celdas visibles; las
 * filas y columnas inmovilizadas se pintan aparte, fijas, sin desplazarse.
 */

export const HEADER_W = 46;
export const HEADER_H = 24;

export interface Sel {
  /** Celda activa */
  ar: number;
  ac: number;
  /** Rango seleccionado (incluye la celda activa) */
  r1: number;
  c1: number;
  r2: number;
  c2: number;
}

export interface EditState {
  r: number;
  c: number;
  text: string;
  /** Empezó tecleando encima (las flechas confirman) o con F2 / doble clic (las flechas mueven el cursor) */
  typed: boolean;
  /** Dónde se escribe: en la celda o en la barra de fórmulas */
  inBar: boolean;
  /** Referencia que se está eligiendo con el ratón (para reemplazarla al arrastrar) */
  pick?: { start: number; end: number; anchor: [number, number] };
}

const REF_COLORS = ["#2563eb", "#dc2626", "#7c3aed", "#059669", "#d97706", "#db2777", "#0891b2"];

/** Posiciones acumuladas (en px de pantalla) de filas o columnas. */
function prefix(n: number, size: (i: number) => number): Float64Array {
  const out = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) out[i + 1] = out[i] + size(i);
  return out;
}

/** Índice cuya posición contiene `x` (búsqueda binaria). */
function findIndex(pos: Float64Array, x: number): number {
  let lo = 0;
  let hi = pos.length - 2;
  if (x <= 0) return 0;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (pos[mid] <= x) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export interface GridApi {
  setSel: (s: Sel) => void;
  startEdit: (text: string, typed: boolean) => void;
  setEdit: (e: EditState | null) => void;
  commitEdit: (move?: [number, number]) => void;
  resize: (axis: "row" | "col", indexes: number[], size: number | null) => void;
  autofit: (axis: "row" | "col", index: number) => void;
  fill: (src: Range, dest: Range) => void;
  updateChart: (id: string, patch: Partial<ChartSpec>) => void;
  selectChart: (id: string | null) => void;
  editChart: (id: string) => void;
  onContextMenu: (x: number, y: number, kind: "cell" | "row" | "col") => void;
  openFilter: (col: number, x: number, y: number) => void;
  openDropdown: (x: number, y: number) => void;
}

/** Lo que el filtro y el formato condicional cambian al dibujar. */
export interface GridView {
  hiddenRows: Set<number>;
  hiddenCols: Set<number>;
  cond: ((r: number, c: number) => CondStyle | null) | null;
  /** Fila de encabezados del filtro, sus columnas y las que tienen criterio */
  filter: { r: number; c1: number; c2: number; active: Set<number> } | null;
  /** La celda activa tiene lista desplegable */
  dropdown: boolean;
  notes?: Record<string, string>;
}

export function Grid({
  sheet,
  si,
  ev,
  sel,
  edit,
  zoom,
  showFormulas,
  selChart,
  api,
  onReady,
  editorRef,
  find,
  view: gv,
}: {
  sheet: Sheet;
  si: number;
  ev: Evaluator;
  sel: Sel;
  edit: EditState | null;
  zoom: number;
  showFormulas: boolean;
  selChart: string | null;
  api: GridApi;
  onReady: (el: HTMLDivElement) => void;
  editorRef: React.RefObject<HTMLTextAreaElement | null>;
  /** Celda resaltada por la búsqueda */
  find: [number, number] | null;
  view: GridView;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ w: 800, h: 500, sx: 0, sy: 0 });
  // Tamaños provisionales mientras se arrastra el borde de una cabecera
  const [drag, setDrag] = useState<null | { axis: "row" | "col"; index: number; size: number }>(null);
  const [fillPreview, setFillPreview] = useState<Range | null>(null);
  const z = zoom;

  const cw = useCallback(
    (c: number) => (gv.hiddenCols.has(c) ? 0 : (drag?.axis === "col" && drag.index === c ? drag.size : colWidth(sheet, c)) * z),
    [sheet, z, drag, gv.hiddenCols],
  );
  const rh = useCallback(
    (r: number) => (gv.hiddenRows.has(r) ? 0 : (drag?.axis === "row" && drag.index === r ? drag.size : rowHeight(sheet, r)) * z),
    [sheet, z, drag, gv.hiddenRows],
  );
  const colX = useMemo(() => prefix(sheet.cols, cw), [sheet.cols, cw]);
  const rowY = useMemo(() => prefix(sheet.rows, rh), [sheet.rows, rh]);
  const fr = Math.min(sheet.freezeR ?? 0, sheet.rows - 1);
  const fc = Math.min(sheet.freezeC ?? 0, sheet.cols - 1);
  const frozenW = colX[fc];
  const frozenH = rowY[fr];
  const hw = HEADER_W * Math.max(1, Math.min(z, 1.4));
  const hh = HEADER_H * Math.max(1, Math.min(z, 1.4));

  useLayoutEffect(() => {
    const el = scroller.current!;
    onReady(el);
    const update = () => setView({ w: el.clientWidth, h: el.clientHeight, sx: el.scrollLeft, sy: el.scrollTop });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [onReady]);

  const { sx, sy, w: vw, h: vh } = view;
  const areaW = vw - hw;
  const areaH = vh - hh;

  // Filas y columnas visibles de la parte que se desplaza
  const c0 = findIndex(colX, sx + frozenW);
  const c1 = Math.min(sheet.cols - 1, findIndex(colX, sx + areaW) + 1);
  const r0 = findIndex(rowY, sy + frozenH);
  const r1 = Math.min(sheet.rows - 1, findIndex(rowY, sy + areaH) + 1);
  const scrollCols = useMemo(() => range(Math.max(c0, fc), c1), [c0, c1, fc]);
  const scrollRows = useMemo(() => range(Math.max(r0, fr), r1), [r0, r1, fr]);
  const frozenCols = useMemo(() => range(0, fc - 1), [fc]);
  const frozenRows = useMemo(() => range(0, fr - 1), [fr]);

  /** Posición en pantalla (dentro del área de celdas) de una columna o fila. */
  const sxOf = (c: number) => (c < fc ? colX[c] : colX[c] - sx);
  const syOf = (r: number) => (r < fr ? rowY[r] : rowY[r] - sy);

  /** Celda bajo un punto de la pantalla (coordenadas de la ventana). */
  const cellAt = useCallback(
    (clientX: number, clientY: number): [number, number] => {
      const rect = scroller.current!.getBoundingClientRect();
      const x = clientX - rect.left - hw;
      const y = clientY - rect.top - hh;
      const cx = x < frozenW ? x : x + sx;
      const cy = y < frozenH ? y : y + sy;
      return [Math.min(sheet.rows - 1, findIndex(rowY, cy)), Math.min(sheet.cols - 1, findIndex(colX, cx))];
    },
    [hw, hh, frozenW, frozenH, sx, sy, rowY, colX, sheet.rows, sheet.cols],
  );

  /** Lleva una celda a la vista si queda fuera. */
  const reveal = useCallback(
    (r: number, c: number) => {
      const el = scroller.current;
      if (!el) return;
      if (c >= fc) {
        const left = colX[c] - frozenW;
        const right = colX[c + 1] - frozenW;
        if (left < el.scrollLeft) el.scrollLeft = left;
        else if (right > el.scrollLeft + el.clientWidth - hw - frozenW) el.scrollLeft = right - (el.clientWidth - hw - frozenW);
      }
      if (r >= fr) {
        const top = rowY[r] - frozenH;
        const bottom = rowY[r + 1] - frozenH;
        if (top < el.scrollTop) el.scrollTop = top;
        else if (bottom > el.scrollTop + el.clientHeight - hh - frozenH) el.scrollTop = bottom - (el.clientHeight - hh - frozenH);
      }
    },
    [colX, rowY, fc, fr, frozenW, frozenH, hw, hh],
  );
  const revealRef = useRef(reveal);
  revealRef.current = reveal;
  useEffect(() => revealRef.current(sel.ar, sel.ac), [sel.ar, sel.ac]);
  useEffect(() => {
    if (find) revealRef.current(find[0], find[1]);
  }, [find]);

  /* ---------------- Ratón ---------------- */
  const dragMode = useRef<null | { kind: "select" | "rows" | "cols" | "fill" | "pick"; anchor: [number, number] }>(null);

  const isPicking = (e: EditState | null) => {
    if (!e || !e.text.startsWith("=")) return false;
    if (e.pick) return true;
    const ta = editorRef.current;
    const caret = ta ? ta.selectionStart : e.text.length;
    const before = e.text.slice(0, caret).trimEnd();
    return /[=(;,+\-*/^&<>:]$/.test(before);
  };

  const insertRef = (anchor: [number, number], to: [number, number]) => {
    if (!edit) return;
    const rg = normRange({ r1: anchor[0], c1: anchor[1], r2: to[0], c2: to[1] });
    const ref = rangeToA1(rg);
    const ta = editorRef.current;
    const start = edit.pick?.start ?? (ta ? ta.selectionStart : edit.text.length);
    const end = edit.pick?.end ?? (ta ? ta.selectionEnd : edit.text.length);
    const text = edit.text.slice(0, start) + ref + edit.text.slice(end);
    api.setEdit({ ...edit, text, typed: false, pick: { start, end: start + ref.length, anchor } });
    setTimeout(() => {
      const t = editorRef.current;
      if (t) {
        t.focus();
        t.setSelectionRange(start + ref.length, start + ref.length);
      }
    });
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 && e.button !== 2) return;
    const rect = scroller.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    // Barras de desplazamiento
    if (x > scroller.current!.clientWidth || y > scroller.current!.clientHeight) return;
    if (x < hw && y < hh) {
      if (edit) api.commitEdit();
      api.setSel({ ar: 0, ac: 0, r1: 0, c1: 0, r2: sheet.rows - 1, c2: sheet.cols - 1 });
      return;
    }
    const [r, c] = cellAt(e.clientX, e.clientY);
    if (e.button === 2) {
      // Clic derecho: si cae fuera de la selección, se selecciona esa celda
      const inSel = r >= Math.min(sel.r1, sel.r2) && r <= Math.max(sel.r1, sel.r2) && c >= Math.min(sel.c1, sel.c2) && c <= Math.max(sel.c1, sel.c2);
      if (!inSel) {
        if (y < hh) api.setSel({ ar: 0, ac: c, r1: 0, c1: c, r2: sheet.rows - 1, c2: c });
        else if (x < hw) api.setSel({ ar: r, ac: 0, r1: r, c1: 0, r2: r, c2: sheet.cols - 1 });
        else api.setSel({ ar: r, ac: c, r1: r, c1: c, r2: r, c2: c });
      }
      return;
    }
    if (y < hh) {
      if (edit) api.commitEdit();
      const anchorC = e.shiftKey ? sel.ac : c;
      api.setSel({ ar: 0, ac: anchorC, r1: 0, c1: anchorC, r2: sheet.rows - 1, c2: c });
      dragMode.current = { kind: "cols", anchor: [0, anchorC] };
      return;
    }
    if (x < hw) {
      if (edit) api.commitEdit();
      const anchorR = e.shiftKey ? sel.ar : r;
      api.setSel({ ar: anchorR, ac: 0, r1: anchorR, c1: 0, r2: r, c2: sheet.cols - 1 });
      dragMode.current = { kind: "rows", anchor: [anchorR, 0] };
      return;
    }
    if (edit && isPicking(edit)) {
      e.preventDefault();
      insertRef([r, c], [r, c]);
      dragMode.current = { kind: "pick", anchor: [r, c] };
      return;
    }
    if (edit) api.commitEdit();
    if (e.shiftKey) {
      api.setSel({ ...sel, r1: sel.ar, c1: sel.ac, r2: r, c2: c });
      dragMode.current = { kind: "select", anchor: [sel.ar, sel.ac] };
    } else {
      api.setSel({ ar: r, ac: c, r1: r, c1: c, r2: r, c2: c });
      dragMode.current = { kind: "select", anchor: [r, c] };
    }
    api.selectChart(null);
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragMode.current;
      if (!d) return;
      const el = scroller.current!;
      const rect = el.getBoundingClientRect();
      // Desplazamiento automático al arrastrar fuera
      if (e.clientY > rect.bottom - 16) el.scrollTop += 24;
      else if (e.clientY < rect.top + hh && d.kind !== "cols") el.scrollTop -= 24;
      if (e.clientX > rect.right - 16) el.scrollLeft += 24;
      else if (e.clientX < rect.left + hw && d.kind !== "rows") el.scrollLeft -= 24;
      const [r, c] = cellAt(e.clientX, e.clientY);
      if (d.kind === "select") api.setSel({ ar: d.anchor[0], ac: d.anchor[1], r1: d.anchor[0], c1: d.anchor[1], r2: r, c2: c });
      else if (d.kind === "cols") api.setSel({ ar: 0, ac: d.anchor[1], r1: 0, c1: d.anchor[1], r2: sheet.rows - 1, c2: c });
      else if (d.kind === "rows") api.setSel({ ar: d.anchor[0], ac: 0, r1: d.anchor[0], c1: 0, r2: r, c2: sheet.cols - 1 });
      else if (d.kind === "pick") insertRef(d.anchor, [r, c]);
      else if (d.kind === "fill") {
        const n = normRange(sel);
        // Se extiende en la dirección en la que más se ha movido
        const dr = r > n.r2 ? r - n.r2 : r < n.r1 ? r - n.r1 : 0;
        const dc = c > n.c2 ? c - n.c2 : c < n.c1 ? c - n.c1 : 0;
        if (!dr && !dc) setFillPreview(null);
        else if (Math.abs(dr) >= Math.abs(dc)) setFillPreview({ r1: Math.min(n.r1, r), c1: n.c1, r2: Math.max(n.r2, r), c2: n.c2 });
        else setFillPreview({ r1: n.r1, c1: Math.min(n.c1, c), r2: n.r2, c2: Math.max(n.c2, c) });
      }
    };
    const onUp = () => {
      const d = dragMode.current;
      dragMode.current = null;
      if (d?.kind === "fill") {
        setFillPreview((p) => {
          if (p) api.fill(normRange(sel), p);
          return null;
        });
      }
      if (d?.kind === "pick" && edit) api.setEdit({ ...edit, pick: undefined });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  });

  const onDoubleClick = (e: React.MouseEvent) => {
    const rect = scroller.current!.getBoundingClientRect();
    if (e.clientX - rect.left < hw || e.clientY - rect.top < hh) return;
    const [r, c] = cellAt(e.clientX, e.clientY);
    api.setSel({ ar: r, ac: c, r1: r, c1: c, r2: r, c2: c });
    api.startEdit(sheet.cells[key(r, c)]?.v ?? "", false);
  };

  /* ---------------- Redimensionar con el borde de las cabeceras ---------------- */
  const startResize = (axis: "row" | "col", index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const start = axis === "col" ? e.clientX : e.clientY;
    const base = axis === "col" ? colWidth(sheet, index) : rowHeight(sheet, index);
    let size = base;
    const move = (ev2: MouseEvent) => {
      size = Math.max(axis === "col" ? 20 : 12, base + ((axis === "col" ? ev2.clientX : ev2.clientY) - start) / z);
      setDrag({ axis, index, size });
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      setDrag(null);
      if (size === base) return;
      // Si la columna forma parte de una selección de columnas completas, se aplican todas
      const n = normRange(sel);
      const whole = axis === "col" ? n.r1 === 0 && n.r2 === sheet.rows - 1 : n.c1 === 0 && n.c2 === sheet.cols - 1;
      const inSel = axis === "col" ? index >= n.c1 && index <= n.c2 : index >= n.r1 && index <= n.r2;
      api.resize(axis, whole && inSel ? range(axis === "col" ? n.c1 : n.r1, axis === "col" ? n.c2 : n.r2) : [index], size);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  /* ---------------- Dibujo ---------------- */
  const n = normRange(sel);
  const covered = useMemo(() => {
    const set = new Set<string>();
    for (const m of sheet.merges ?? []) for (let r = m.r1; r <= m.r2; r++) for (let c = m.c1; c <= m.c2; c++) if (r !== m.r1 || c !== m.c1) set.add(key(r, c));
    return set;
  }, [sheet.merges]);

  const editRefs = useMemo(() => (edit ? formulaRefs(edit.text).filter((x) => !x.sheet || x.sheet.toLowerCase() === sheet.name.toLowerCase()) : []), [edit, sheet.name]);

  const renderCells = (rows: number[], cols: number[], ox: number, oy: number): ReactNode[] => {
    const out: ReactNode[] = [];
    const lastCol = cols[cols.length - 1] ?? 0;
    for (const r of rows) {
      if (gv.hiddenRows.has(r)) continue;
      for (const c of cols) {
        const k = key(r, c);
        if (covered.has(k) || gv.hiddenCols.has(c)) continue;
        const cell = sheet.cells[k];
        const m = sheet.merges?.length ? mergeAt(sheet, r, c) : undefined;
        if (!cell && !m) continue;
        if (edit && edit.r === r && edit.c === c && !edit.inBar) continue;
        const cf = gv.cond?.(r, c) ?? null;
        const st = cf ? { ...cell?.s, bg: cf.bg ?? cell?.s?.bg, color: cf.color ?? cell?.s?.color, b: cf.bold || cell?.s?.b } : (cell?.s ?? {});
        const v = ev.value(si, r, c);
        const text = showFormulas && cell?.v.startsWith("=") ? cell.v : formatValue(v, st);
        let w = cw(c);
        let h = rh(r);
        if (m) {
          w = colX[m.c2 + 1] - colX[m.c1];
          h = rowY[m.r2 + 1] - rowY[m.r1];
        }
        const align = st.align ?? (showFormulas && cell?.v.startsWith("=") ? "left" : defaultAlign(v));
        // El texto largo invade las celdas vacías de la derecha
        let textW = w;
        if (!m && !st.wrap && align === "left" && text && typeof v === "string") {
          let cc = c + 1;
          while (cc <= Math.min(lastCol + 8, sheet.cols - 1) && !sheet.cells[key(r, cc)]?.v && cc - c < 12) cc++;
          textW = colX[cc] - colX[c];
        }
        const shadows = [st.bt && "inset 0 1px 0 #7a7a7a", st.bb && "inset 0 -1px 0 #7a7a7a", st.bl && "inset 1px 0 0 #7a7a7a", st.br && "inset -1px 0 0 #7a7a7a"].filter(Boolean);
        const style: CSSProperties = {
          left: (c < fc ? colX[c] : colX[c] - sx) - ox,
          top: (r < fr ? rowY[r] : rowY[r] - sy) - oy,
          width: w,
          height: h,
          background: st.bg ?? (m ? "var(--paper)" : undefined),
          boxShadow: shadows.length ? shadows.join(",") : undefined,
          zIndex: textW > w ? 1 : undefined,
        };
        const textStyle: CSSProperties = {
          width: textW,
          justifyContent: align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start",
          alignItems: st.valign === "top" ? "flex-start" : st.valign === "middle" ? "center" : "flex-end",
          textAlign: align,
          fontWeight: st.b ? 700 : undefined,
          fontStyle: st.i ? "italic" : undefined,
          textDecoration: [st.u && "underline", st.s && "line-through"].filter(Boolean).join(" ") || undefined,
          color: v instanceof FErr ? "#dc2626" : st.color,
          fontSize: (st.fs ?? 11) * 1.333 * z,
          fontFamily: st.font,
          whiteSpace: st.wrap ? "pre-wrap" : "pre",
          wordBreak: st.wrap ? "break-word" : undefined,
          lineHeight: 1.25,
        };
        out.push(
          <div key={k} className="sg-cell" style={style}>
            {cf?.bar && <div className="sg-bar" style={{ width: `calc(${cf.bar.pct * 100}% - 4px)`, background: `linear-gradient(90deg, ${cf.bar.color}, ${cf.bar.color}55)` }} />}
            {text && (
              <div className="sg-text" style={textStyle}>
                {text}
              </div>
            )}
          </div>,
        );
      }
    }
    // Comentarios: triángulo rojo y el texto al pasar el ratón
    if (gv.notes) {
      const rowSet = new Set(rows);
      const colSet = new Set(cols);
      for (const [k, text] of Object.entries(gv.notes)) {
        const [r, c] = k.split(",").map(Number);
        if (!rowSet.has(r) || !colSet.has(c) || gv.hiddenRows.has(r) || gv.hiddenCols.has(c)) continue;
        out.push(
          <div key={`n${k}`} className="sg-note" style={{ left: sxOf(c) - ox, top: syOf(r) - oy, width: cw(c), height: rh(r) }}>
            <span className="sg-note-mark" />
            <div className="sg-note-pop">{text}</div>
          </div>,
        );
      }
    }
    // Botones del filtro en la fila de encabezados
    const f = gv.filter;
    if (f && rows.includes(f.r)) {
      for (const c of cols) {
        if (c < f.c1 || c > f.c2 || gv.hiddenCols.has(c)) continue;
        const size = Math.min(18, rh(f.r) - 4) ;
        out.push(
          <button
            key={`flt${c}`}
            className={cn("sg-filter-btn", f.active.has(c) && "sg-filter-on")}
            style={{ left: sxOf(c) + cw(c) - size - 2 - ox, top: syOf(f.r) + rh(f.r) - size - 2 - oy, width: size, height: size }}
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              const b = (e.currentTarget as HTMLElement).getBoundingClientRect();
              api.openFilter(c, b.left, b.bottom + 4);
            }}
            title={f.active.has(c) ? "Filtro aplicado: clic para cambiarlo" : "Filtrar u ordenar"}
          >
            <svg viewBox="0 0 12 12" width="10" height="10" fill="currentColor">
              {f.active.has(c) ? <path d="M1 2h10L7 6.5V10L5 11V6.5z" /> : <path d="M2 4h8L6 8.5z" />}
            </svg>
          </button>,
        );
      }
    }
    return out;
  };

  const renderLines = (rows: number[], cols: number[], ox: number, oy: number, w: number, h: number) => {
    if (sheet.showGrid === false) return null;
    const lines: ReactNode[] = [];
    for (const c of cols) {
      if (gv.hiddenCols.has(c)) continue;
      const x = Math.round(sxOf(c) + cw(c) - ox) - 0.5;
      lines.push(<line key={`c${c}`} x1={x} x2={x} y1={0} y2={h} />);
    }
    for (const r of rows) {
      if (gv.hiddenRows.has(r)) continue;
      const y = Math.round(syOf(r) + rh(r) - oy) - 0.5;
      lines.push(<line key={`r${r}`} x1={0} x2={w} y1={y} y2={y} />);
    }
    return (
      <svg className="sg-lines" width={w} height={h}>
        {lines}
      </svg>
    );
  };

  const rectOf = (rg: Range, ox: number, oy: number) => {
    const g = normRange(rg);
    const left = sxOf(g.c1) - ox;
    const top = syOf(g.r1) - oy;
    // Si el rango cruza la zona inmovilizada, se toma el ancho real
    const right = sxOf(g.c2) + cw(g.c2) - ox;
    const bottom = syOf(g.r2) + rh(g.r2) - oy;
    return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
  };

  const renderOverlay = (ox: number, oy: number) => {
    // La selección se amplía para incluir las celdas combinadas que toca
    let selR: Range = n;
    for (const m of sheet.merges ?? []) {
      if (!(m.r2 < selR.r1 || m.r1 > selR.r2 || m.c2 < selR.c1 || m.c1 > selR.c2)) {
        selR = { r1: Math.min(selR.r1, m.r1), c1: Math.min(selR.c1, m.c1), r2: Math.max(selR.r2, m.r2), c2: Math.max(selR.c2, m.c2) };
      }
    }
    const selRect = rectOf(selR, ox, oy);
    const am = mergeAt(sheet, sel.ar, sel.ac);
    const activeRect = rectOf(am ?? { r1: sel.ar, c1: sel.ac, r2: sel.ar, c2: sel.ac }, ox, oy);
    const multi = n.r1 !== n.r2 || n.c1 !== n.c2;
    return (
      <>
        {multi && <div className="sg-sel-fill" style={selRect} />}
        <div className="sg-sel" style={selRect} />
        {multi && <div className="sg-active" style={activeRect} />}
        {!edit && (
          <div
            className="sg-fill-handle"
            style={{ left: selRect.left + selRect.width - 4, top: selRect.top + selRect.height - 4 }}
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              dragMode.current = { kind: "fill", anchor: [n.r2, n.c2] };
            }}
            title="Arrastra para rellenar"
          />
        )}
        {fillPreview && <div className="sg-fill-preview" style={rectOf(fillPreview, ox, oy)} />}
        {gv.dropdown && !edit && (
          <button
            className="sg-dropdown-btn"
            style={{ left: activeRect.left + activeRect.width + 2, top: activeRect.top + activeRect.height - 20, height: 20 }}
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              const b = (e.currentTarget as HTMLElement).getBoundingClientRect();
              api.openDropdown(b.left - activeRect.width - 2, b.bottom + 2);
            }}
            title="Elegir de la lista (Alt+↓)"
          >
            <svg viewBox="0 0 12 12" width="10" height="10" fill="currentColor"><path d="M2 4h8L6 8.5z" /></svg>
          </button>
        )}
        {find && <div className="sg-find" style={rectOf({ r1: find[0], c1: find[1], r2: find[0], c2: find[1] }, ox, oy)} />}
        {editRefs.map((x, i) => (
          <div key={i} className="sg-ref" style={{ ...rectOf(x, ox, oy), borderColor: REF_COLORS[i % REF_COLORS.length], background: REF_COLORS[i % REF_COLORS.length] + "14" }} />
        ))}
      </>
    );
  };

  const quadrant = (rows: number[], cols: number[], left: number, top: number, w: number, h: number, ox: number, oy: number, k: string) =>
    w > 0 && h > 0 ? (
      <div key={k} className="sg-quad" style={{ left, top, width: w, height: h }}>
        {renderLines(rows, cols, ox, oy, w, h)}
        {renderCells(rows, cols, ox, oy)}
        {renderOverlay(ox, oy)}
      </div>
    ) : null;

  const mainW = Math.max(0, areaW - frozenW);
  const mainH = Math.max(0, areaH - frozenH);

  // Cabeceras
  const selCols = (c: number) => c >= n.c1 && c <= n.c2;
  const selRows = (r: number) => r >= n.r1 && r <= n.r2;
  const wholeCols = n.r1 === 0 && n.r2 === sheet.rows - 1;
  const wholeRows = n.c1 === 0 && n.c2 === sheet.cols - 1;
  const colHeader = (c: number) => gv.hiddenCols.has(c) ? null : (
    <div
      key={c}
      className={cn("sg-colh", selCols(c) && "sg-h-sel", wholeCols && selCols(c) && "sg-h-full")}
      style={{ left: hw + sxOf(c), width: cw(c), height: hh, fontSize: 11.5 * Math.min(z, 1.3) }}
    >
      {colName(c)}
      <span
        className="sg-resize-col"
        onMouseDown={(e) => startResize("col", c, e)}
        onDoubleClick={(e) => {
          e.stopPropagation();
          api.autofit("col", c);
        }}
      />
    </div>
  );
  const rowHeader = (r: number) => gv.hiddenRows.has(r) ? null : (
    <div
      key={r}
      className={cn("sg-rowh", selRows(r) && "sg-h-sel", wholeRows && selRows(r) && "sg-h-full", gv.filter && r > gv.filter.r && gv.hiddenRows.size > 0 && "sg-h-filtered")}
      style={{ top: hh + syOf(r), height: rh(r), width: hw, fontSize: 11.5 * Math.min(z, 1.3) }}
    >
      {r + 1}
      <span
        className="sg-resize-row"
        onMouseDown={(e) => startResize("row", r, e)}
        onDoubleClick={(e) => {
          e.stopPropagation();
          api.autofit("row", r);
        }}
      />
    </div>
  );

  // Editor encima de la celda
  const editBox = edit && !edit.inBar ? (() => {
    const m = mergeAt(sheet, edit.r, edit.c);
    const rg = m ?? { r1: edit.r, c1: edit.c, r2: edit.r, c2: edit.c };
    const r = rectOf(rg, 0, 0);
    const st = sheet.cells[key(edit.r, edit.c)]?.s ?? {};
    return {
      left: hw + r.left,
      top: hh + r.top,
      minWidth: r.width,
      minHeight: r.height,
      maxWidth: Math.max(r.width, vw - hw - r.left - 8),
      fontSize: (st.fs ?? 11) * 1.333 * z,
      fontWeight: st.b ? 700 : undefined,
      fontStyle: st.i ? "italic" : undefined,
      fontFamily: st.font,
      color: st.color,
      background: st.bg ?? "var(--paper)",
      textAlign: st.align,
    } as CSSProperties;
  })() : null;

  // Gráficos
  const charts = (sheet.charts ?? []).map((ch) => {
    const left = hw + ch.x * z - sx;
    const top = hh + ch.y * z - sy;
    return { ch, left, top };
  });

  return (
    <div
      ref={scroller}
      className="sheet-grid relative min-h-0 flex-1 overflow-auto outline-none"
      tabIndex={0}
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      onContextMenu={(e) => {
        e.preventDefault();
        const rect = scroller.current!.getBoundingClientRect();
        const kind = e.clientY - rect.top < hh ? "col" : e.clientX - rect.left < hw ? "row" : "cell";
        api.onContextMenu(e.clientX, e.clientY, kind);
      }}
    >
      <div style={{ width: hw + colX[sheet.cols] + 40, height: hh + rowY[sheet.rows] + 40, position: "relative" }}>
        <div className="sg-view" style={{ width: vw, height: vh }}>
          {quadrant(scrollRows, scrollCols, hw + frozenW, hh + frozenH, mainW, mainH, frozenW, frozenH, "main")}
          {quadrant(frozenRows, scrollCols, hw + frozenW, hh, mainW, frozenH, frozenW, 0, "top")}
          {quadrant(scrollRows, frozenCols, hw, hh + frozenH, frozenW, mainH, 0, frozenH, "left")}
          {quadrant(frozenRows, frozenCols, hw, hh, frozenW, frozenH, 0, 0, "corner")}
          {(fr > 0 || fc > 0) && (
            <>
              {fr > 0 && <div className="sg-freeze-line" style={{ left: hw, top: hh + frozenH - 1, width: areaW, height: 2 }} />}
              {fc > 0 && <div className="sg-freeze-line" style={{ left: hw + frozenW - 1, top: hh, width: 2, height: areaH }} />}
            </>
          )}

          {/* Gráficos */}
          <div className="sg-charts" style={{ left: hw, top: hh, width: areaW, height: areaH }}>
            {charts.map(({ ch, left, top }) => (
              <ChartBox
                key={ch.id}
                spec={ch}
                left={left - hw}
                top={top - hh}
                zoom={z}
                selected={selChart === ch.id}
                ev={ev}
                si={si}
                hidden={gv.hiddenRows}
                api={api}
              />
            ))}
          </div>

          {/* Cabeceras */}
          <div className="sg-headers-top" style={{ height: hh, width: vw }}>
            {scrollCols.map((c) => colHeader(c))}
            <div className="sg-headers-frozen" style={{ left: 0, width: hw + frozenW, height: hh }}>
              {frozenCols.map((c) => colHeader(c))}
            </div>
          </div>
          <div className="sg-headers-left" style={{ width: hw, height: vh }}>
            {scrollRows.map((r) => rowHeader(r))}
            <div className="sg-headers-frozen" style={{ top: 0, height: hh + frozenH, width: hw }}>
              {frozenRows.map((r) => rowHeader(r))}
            </div>
          </div>
          <div className="sg-corner" style={{ width: hw, height: hh }} title="Seleccionar todo" />

          {editBox && (
            <textarea
              ref={editorRef}
              className="sg-editor"
              style={editBox}
              value={edit!.text}
              spellCheck={false}
              onChange={(e) => api.setEdit({ ...edit!, text: e.target.value, pick: undefined })}
              onMouseDown={(e) => e.stopPropagation()}
              rows={1}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function range(a: number, b: number): number[] {
  const out: number[] = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

/* ---------------- Gráfico flotante ---------------- */

function ChartBox({
  spec,
  left,
  top,
  zoom,
  selected,
  ev,
  si,
  hidden,
  api,
}: {
  spec: ChartSpec;
  left: number;
  top: number;
  zoom: number;
  selected: boolean;
  ev: Evaluator;
  si: number;
  hidden: Set<number>;
  api: GridApi;
}) {
  const data = useMemo(() => chartData(spec, ev, si, hidden), [spec, ev, si, hidden]);
  const [live, setLive] = useState<null | { x: number; y: number; w: number; h: number }>(null);
  const cur = live ?? { x: spec.x, y: spec.y, w: spec.w, h: spec.h };

  const drag = (e: React.MouseEvent, mode: "move" | "resize") => {
    e.stopPropagation();
    e.preventDefault();
    api.selectChart(spec.id);
    const sx = e.clientX;
    const sy = e.clientY;
    let next = { x: spec.x, y: spec.y, w: spec.w, h: spec.h };
    const move = (ev2: MouseEvent) => {
      const dx = (ev2.clientX - sx) / zoom;
      const dy = (ev2.clientY - sy) / zoom;
      next =
        mode === "move"
          ? { ...next, x: Math.max(0, spec.x + dx), y: Math.max(0, spec.y + dy) }
          : { ...next, w: Math.max(160, spec.w + dx), h: Math.max(120, spec.h + dy) };
      setLive(next);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      setLive(null);
      if (next.x !== spec.x || next.y !== spec.y || next.w !== spec.w || next.h !== spec.h) api.updateChart(spec.id, next);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  return (
    <div
      className={cn("sg-chart", selected && "sg-chart-sel")}
      style={{ left: left + (cur.x - spec.x) * zoom, top: top + (cur.y - spec.y) * zoom, width: cur.w * zoom, height: cur.h * zoom }}
      onMouseDown={(e) => drag(e, "move")}
      onDoubleClick={(e) => {
        e.stopPropagation();
        api.editChart(spec.id);
      }}
      onContextMenu={(e) => e.stopPropagation()}
      title="Arrastra para mover · doble clic para editar"
    >
      <div style={{ transform: `scale(${zoom})`, transformOrigin: "0 0", width: cur.w, height: cur.h }}>
        <ChartSvg type={spec.type} data={data} width={cur.w} height={cur.h} title={spec.title} legend={spec.legend !== false} />
      </div>
      {selected && <div className="sg-chart-resize" onMouseDown={(e) => drag(e, "resize")} />}
    </div>
  );
}
