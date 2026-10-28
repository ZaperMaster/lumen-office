import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLiveQuery } from "dexie-react-hooks";
import {
  AlignCenter, AlignLeft, AlignRight, ArrowDownAZ, ArrowDownZA, ArrowDownToLine, ArrowUpToLine, BarChart3, Bold, Calendar,
  ChevronDown, ClipboardPaste, Copy, Eraser, FileSpreadsheet, FileText, FoldVertical, Grid3x3, Highlighter, Italic, Lock, Merge,
  Minus, PaintBucket, Plus, Printer, RefreshCw, Rows3, Columns3, Scissors, Search, Sigma, Sparkles, Strikethrough, Table2,
  Trash2, Type, Underline, Undo2, Redo2, WrapText, X, Percent, Euro, Hash, SquareFunction, Eye, CopyX, Loader2, Square,
} from "lucide-react";
import { db, type DocRecord, type FileFormat } from "@/lib/db";
import { Evaluator, checkFormula, type Scalar } from "@/lib/sheet/formula";
import { NUM_FORMATS, editText, formatValue } from "@/lib/sheet/format";
import {
  addr, colWidth, key, newWorkbook, normRange, parseRange, rangeToA1, rowHeight, uid, usedRange, workbookText,
  type CellStyle, type ChartSpec, type NumFmt, type Range, type Sheet, type Workbook,
} from "@/lib/sheet/model";
import * as ops from "@/lib/sheet/ops";
import { FN_INFO, suggestFunctions, type FnInfo } from "@/lib/sheet/functions";
import { streamText } from "@/lib/ai";
import { isDesktop, openFileFromDisk } from "@/lib/files";
import { openDoc } from "@/lib/actions";
import { useApp } from "@/store/app";
import { Grid, type EditState, type GridApi, type Sel } from "@/components/sheet/Grid";
import { CHART_TYPES, ChartSvg, chartData } from "@/components/sheet/Chart";
import { OfficeFileMenu, OfficeHeader, RBig, RGroup, RibbonTabs } from "@/components/office/OfficeChrome";
import { useOfficeDoc } from "@/components/office/useOfficeDoc";
import { ColorButton, FontPicker, FontSizePicker } from "@/components/editor/controls";
import { Button, Dialog, IconButton, Input, Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, Slider, Switch, Tooltip, cn } from "@/components/ui";

/* ------------------------------------------------------------------ */
/*  Carga                                                              */
/* ------------------------------------------------------------------ */

export default function SheetApp({ id }: { id: string }) {
  const doc = useLiveQuery(() => db.docs.get(id).then((d) => d ?? null), [id]);
  const navigate = useApp((s) => s.navigate);
  if (doc === undefined) {
    return (
      <div className="grid h-full place-items-center">
        <div className="size-6 animate-spin rounded-full border-2 border-border border-t-accent" />
      </div>
    );
  }
  if (doc === null || doc.deletedAt) {
    return (
      <div className="grid h-full place-items-center">
        <div className="text-center">
          <p className="mb-3 text-muted">Esta hoja de cálculo no existe o está en la papelera.</p>
          <Button variant="primary" onClick={() => navigate({ name: "home" })}>Volver al inicio</Button>
        </div>
      </div>
    );
  }
  return <SheetEditor doc={doc} />;
}

function initialWorkbook(data: unknown): Workbook {
  const wb = data as Workbook | undefined;
  if (!wb?.sheets?.length) return newWorkbook();
  return { ...wb, active: Math.min(wb.active ?? 0, wb.sheets.length - 1) };
}

const SAVE_ORDER: FileFormat[] = ["xlsx", "csv"];

async function buildFile(format: FileFormat, wb: Workbook): Promise<Uint8Array> {
  const x = await import("@/lib/sheet/xlsx");
  if (format === "csv") return new TextEncoder().encode(x.buildCsv(wb));
  return x.buildXlsx(wb);
}

type Tab = "home" | "insert" | "formulas" | "data" | "view" | "ai";

/** Región contigua con datos alrededor de una celda (como Ctrl+Mayús+* en Excel). */
function currentRegion(s: Sheet, r: number, c: number): Range {
  const has = (rr: number, cc: number) => rr >= 0 && cc >= 0 && !!s.cells[key(rr, cc)]?.v;
  let g = { r1: r, c1: c, r2: r, c2: c };
  for (let changed = true, i = 0; changed && i < 200; i++) {
    changed = false;
    const rowHas = (rr: number) => { for (let cc = g.c1 - 1; cc <= g.c2 + 1; cc++) if (has(rr, cc)) return true; return false; };
    const colHas = (cc: number) => { for (let rr = g.r1 - 1; rr <= g.r2 + 1; rr++) if (has(rr, cc)) return true; return false; };
    if (rowHas(g.r1 - 1)) { g = { ...g, r1: g.r1 - 1 }; changed = true; }
    if (rowHas(g.r2 + 1)) { g = { ...g, r2: g.r2 + 1 }; changed = true; }
    if (colHas(g.c1 - 1)) { g = { ...g, c1: g.c1 - 1 }; changed = true; }
    if (colHas(g.c2 + 1)) { g = { ...g, c2: g.c2 + 1 }; changed = true; }
  }
  return g;
}

/* ------------------------------------------------------------------ */
/*  Editor                                                             */
/* ------------------------------------------------------------------ */

function SheetEditor({ doc }: { doc: DocRecord }) {
  const toast = useApp((s) => s.toast);
  const navigate = useApp((s) => s.navigate);
  const [wb, setWb] = useState<Workbook>(() => initialWorkbook(doc.data));
  const wbRef = useRef(wb);
  wbRef.current = wb;
  const undoStack = useRef<Workbook[]>([]);
  const redoStack = useRef<Workbook[]>([]);
  const [title, setTitle] = useState(doc.title);
  const [tab, setTab] = useState<Tab>("home");
  const [sel, setSelState] = useState<Sel>({ ar: 0, ac: 0, r1: 0, c1: 0, r2: 0, c2: 0 });
  const [edit, setEdit] = useState<EditState | null>(null);
  const editRef = useRef(edit);
  editRef.current = edit;
  const [zoom, setZoom] = useState(1);
  const [showFormulas, setShowFormulas] = useState(false);
  const [selChart, setSelChart] = useState<string | null>(null);
  const [chartDialog, setChartDialog] = useState<null | { id?: string; spec: Omit<ChartSpec, "id"> }>(null);
  const [fnDialog, setFnDialog] = useState(false);
  const [aiDialog, setAiDialog] = useState<null | "formula" | "analyze" | "generate">(null);
  const [findOpen, setFindOpen] = useState<null | { replace: boolean }>(null);
  const [findHit, setFindHit] = useState<[number, number] | null>(null);
  const [menu, setMenu] = useState<null | { x: number; y: number; kind: "cell" | "row" | "col" | "tab"; tab?: number }>(null);
  const [recalc, setRecalc] = useState(0);
  const [printing, setPrinting] = useState(false);
  const [suggestIdx, setSuggestIdx] = useState(0);
  const gridEl = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const barRef = useRef<HTMLInputElement>(null);
  const clip = useRef<ops.ClipData | null>(null);

  const si = wb.active;
  const sheet = wb.sheets[si];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ev = useMemo(() => new Evaluator(wb), [wb, recalc]);
  const n = normRange(sel);

  const { saveState, files, diskState, unsavedFile } = useOfficeDoc({
    doc,
    data: wb,
    title,
    text: (w) => workbookText(w),
    build: (f, w) => buildFile(f, w),
    order: SAVE_ORDER,
  });

  /* ---------------- Cambios con deshacer ---------------- */
  const commit = useCallback((fn: (w: Workbook) => Workbook) => {
    const prev = wbRef.current;
    const next = fn(prev);
    if (next === prev) return;
    undoStack.current.push(prev);
    if (undoStack.current.length > 200) undoStack.current.shift();
    redoStack.current = [];
    wbRef.current = next;
    setWb(next);
  }, []);
  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    redoStack.current.push(wbRef.current);
    wbRef.current = prev;
    setWb(prev);
  }, []);
  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(wbRef.current);
    wbRef.current = next;
    setWb(next);
  }, []);

  const focusGrid = () => {
    gridEl.current?.focus({ preventScroll: true });
    // Por si React aún no ha quitado el editor (que tenía el foco)
    setTimeout(() => { if (!editRef.current) gridEl.current?.focus({ preventScroll: true }); }, 0);
  };

  const setSel = useCallback((s: Sel) => {
    const sh = wbRef.current.sheets[wbRef.current.active];
    const clamp = (v: number, max: number) => Math.max(0, Math.min(max - 1, v));
    setSelState({
      ar: clamp(s.ar, sh.rows),
      ac: clamp(s.ac, sh.cols),
      r1: clamp(s.r1, sh.rows),
      c1: clamp(s.c1, sh.cols),
      r2: clamp(s.r2, sh.rows),
      c2: clamp(s.c2, sh.cols),
    });
  }, []);

  /* ---------------- Edición de celdas ---------------- */
  const startEdit = useCallback(
    (text: string, typed: boolean, inBar = false) => {
      setSuggestIdx(0);
      setEdit({ r: sel.ar, c: sel.ac, text, typed, inBar });
    },
    [sel.ar, sel.ac],
  );

  const commitEdit = useCallback(
    (move?: [number, number], toRange = false) => {
      const e = editRef.current;
      if (!e) return;
      let text = e.text;
      if (text.startsWith("=") && text.length > 1) {
        // Se cierran solos los paréntesis que falten
        const open = (text.match(/\(/g) ?? []).length - (text.match(/\)/g) ?? []).length;
        if (open > 0) text += ")".repeat(open);
        const err = checkFormula(text.slice(1));
        if (err) {
          toast(`La fórmula tiene un error: ${err}`, "error", { detail: "Corrígela o pulsa Esc para cancelar." });
          return;
        }
      }
      const cell = wbRef.current.sheets[wbRef.current.active].cells[key(e.r, e.c)];
      const original = editText(cell?.v ?? "", cell?.s);
      if (toRange) commit((w) => ops.inputRange(w, w.active, n, text));
      else if (text !== original) commit((w) => ops.inputCell(w, w.active, e.r, e.c, text));
      setEdit(null);
      if (move) {
        const r = e.r + move[0];
        const c = e.c + move[1];
        setSel({ ar: r, ac: c, r1: r, c1: c, r2: r, c2: c });
      }
      focusGrid();
    },
    [commit, toast, setSel, n],
  );

  const cancelEdit = () => {
    setEdit(null);
    focusGrid();
  };

  // Al empezar a editar, el cursor va al final del texto
  const editKey = edit ? `${edit.r},${edit.c},${edit.inBar}` : "";
  useEffect(() => {
    if (!editKey) return;
    const el = editRef.current?.inBar ? barRef.current : editorRef.current;
    if (!el) return;
    el.focus();
    const len = el.value.length;
    el.setSelectionRange(len, len);
  }, [editKey]);

  /* ---------------- Acciones sobre la selección ---------------- */
  const style = useCallback((patch: Partial<CellStyle> | ((s: CellStyle) => CellStyle)) => commit((w) => ops.styleRange(w, w.active, n, patch)), [commit, n]);
  const activeCell = sheet.cells[key(sel.ar, sel.ac)];
  const st: CellStyle = activeCell?.s ?? {};
  const toggle = (k: "b" | "i" | "u" | "s" | "wrap") => style({ [k]: st[k] ? undefined : true });

  const autoSum = (fn: "SUMA" | "PROMEDIO" | "CONTAR" | "MAX" | "MIN") => {
    // Con un rango seleccionado, el resultado va debajo de cada columna
    if (n.r1 !== n.r2 || n.c1 !== n.c2) {
      const r = n.r2 + 1;
      commit((w) => {
        let out = w;
        for (let c = n.c1; c <= n.c2; c++) out = ops.inputCell(out, w.active, r, c, `=${fn}(${addr(n.r1, c)}:${addr(n.r2, c)})`);
        return out;
      });
      setSel({ ar: r, ac: n.c1, r1: r, c1: n.c1, r2: r, c2: n.c2 });
      return;
    }
    // Una sola celda: se busca el bloque de números de arriba (o de la izquierda)
    const isNum = (r: number, c: number) => r >= 0 && c >= 0 && typeof ev.value(si, r, c) === "number";
    let text: string;
    if (isNum(sel.ar - 1, sel.ac)) {
      let top = sel.ar - 1;
      while (isNum(top - 1, sel.ac)) top--;
      text = `=${fn}(${addr(top, sel.ac)}:${addr(sel.ar - 1, sel.ac)})`;
    } else if (isNum(sel.ar, sel.ac - 1)) {
      let left = sel.ac - 1;
      while (isNum(sel.ar, left - 1)) left--;
      text = `=${fn}(${addr(sel.ar, left)}:${addr(sel.ar, sel.ac - 1)})`;
    } else text = `=${fn}()`;
    setEdit({ r: sel.ar, c: sel.ac, text, typed: false, inBar: false });
  };

  const insertLines = (axis: "row" | "col", where: "before" | "after") => {
    const count = axis === "row" ? n.r2 - n.r1 + 1 : n.c2 - n.c1 + 1;
    const at = axis === "row" ? (where === "before" ? n.r1 : n.r2 + 1) : where === "before" ? n.c1 : n.c2 + 1;
    commit((w) => ops.insertLines(w, w.active, axis, at, Math.min(count, 1000)));
  };
  const deleteLines = (axis: "row" | "col") => {
    const count = axis === "row" ? n.r2 - n.r1 + 1 : n.c2 - n.c1 + 1;
    commit((w) => ops.insertLines(w, w.active, axis, axis === "row" ? n.r1 : n.c1, -count));
    setSel({ ar: n.r1, ac: n.c1, r1: n.r1, c1: n.c1, r2: n.r1, c2: n.c1 });
  };

  const sort = (asc: boolean) => {
    // Sin rango, se ordena la región de datos por la columna activa
    const rg = n.r1 === n.r2 && n.c1 === n.c2 ? currentRegion(sheet, sel.ar, sel.ac) : n;
    const firstRowText = (() => {
      for (let c = rg.c1; c <= rg.c2; c++) if (typeof ev.value(si, rg.r1, c) !== "string") return false;
      return rg.r2 > rg.r1;
    })();
    commit((w) => ops.sortRange(w, w.active, rg, sel.ac, asc, firstRowText));
    toast(asc ? "Ordenado de A a Z" : "Ordenado de Z a A", "success");
  };

  const removeDuplicates = () => {
    const rg = n.r1 === n.r2 && n.c1 === n.c2 ? currentRegion(sheet, sel.ar, sel.ac) : n;
    const seen = new Set<string>();
    const keep: number[] = [];
    for (let r = rg.r1; r <= rg.r2; r++) {
      const sig: string[] = [];
      for (let c = rg.c1; c <= rg.c2; c++) sig.push(formatValue(ev.value(si, r, c)));
      const k = sig.join("\u0001");
      if (seen.has(k)) continue;
      seen.add(k);
      keep.push(r);
    }
    const removed = rg.r2 - rg.r1 + 1 - keep.length;
    if (!removed) return toast("No hay filas duplicadas");
    commit((w) => {
      const s = w.sheets[w.active];
      const rows = keep.map((r) => {
        const cells = [];
        for (let c = rg.c1; c <= rg.c2; c++) cells.push(s.cells[key(r, c)]);
        return cells;
      });
      let out = ops.clearRange(w, w.active, rg, "all");
      out = ops.pasteClip(out, w.active, rg.r1, rg.c1, { rows: rows.length, cols: rg.c2 - rg.c1 + 1, cells: rows, r: rg.r1, c: rg.c1, sheet: w.active, cut: true, text: "" });
      return out;
    });
    toast(`${removed} fila${removed === 1 ? "" : "s"} duplicada${removed === 1 ? "" : "s"} eliminada${removed === 1 ? "" : "s"}`, "success");
  };

  const freeze = (r: number, c: number) => commit((w) => ops.updateSheet(w, w.active, { freezeR: r || undefined, freezeC: c || undefined }));

  /* ---------------- Portapapeles ---------------- */
  const displayAt = useCallback((r: number, c: number) => {
    const cell = sheet.cells[key(r, c)];
    return formatValue(ev.value(si, r, c), cell?.s);
  }, [sheet, ev, si]);

  const copy = useCallback((cut: boolean) => {
    const text = ops.rangeToText(wbRef.current, si, n, displayAt);
    clip.current = ops.copyRange(wbRef.current, si, n, cut, text);
    return text;
  }, [si, n, displayAt]);

  const pasteFrom = useCallback((text: string | null, mode: "all" | "values" | "formats" = "all") => {
    const c = clip.current;
    if (c && (text === null || text.replace(/\r/g, "") === c.text)) {
      commit((w) => ops.pasteClip(w, w.active, n.r1, n.c1, c, mode));
      if (c.cut) clip.current = null;
      setSel({ ar: n.r1, ac: n.c1, r1: n.r1, c1: n.c1, r2: n.r1 + c.rows - 1, c2: n.c1 + c.cols - 1 });
    } else if (text) {
      commit((w) => ops.pasteText(w, w.active, n.r1, n.c1, text));
      const lines = text.replace(/\n$/, "").split("\n");
      setSel({ ar: n.r1, ac: n.c1, r1: n.r1, c1: n.c1, r2: n.r1 + lines.length - 1, c2: n.c1 + Math.max(...lines.map((l) => l.split("\t").length)) - 1 });
    }
  }, [commit, n, setSel]);

  useEffect(() => {
    const active = () => document.activeElement === gridEl.current;
    const onCopy = (e: ClipboardEvent) => {
      if (!active()) return;
      e.preventDefault();
      e.clipboardData?.setData("text/plain", copy(false));
    };
    const onCut = (e: ClipboardEvent) => {
      if (!active()) return;
      e.preventDefault();
      e.clipboardData?.setData("text/plain", copy(true));
    };
    const onPaste = (e: ClipboardEvent) => {
      if (!active()) return;
      e.preventDefault();
      pasteFrom(e.clipboardData?.getData("text/plain") ?? null);
    };
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCut);
    document.addEventListener("paste", onPaste);
    return () => {
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("paste", onPaste);
    };
  }, [copy, pasteFrom]);

  const ribbonPaste = async (mode: "all" | "values" | "formats" = "all") => {
    let text: string | null = null;
    if (mode === "all") {
      try {
        text = await navigator.clipboard.readText();
      } catch {
        text = null;
      }
    }
    pasteFrom(text, mode);
    focusGrid();
  };

  /* ---------------- Teclado ---------------- */
  const jump = (r: number, c: number, dr: number, dc: number): [number, number] => {
    const has = (rr: number, cc: number) => !!sheet.cells[key(rr, cc)]?.v;
    const inside = (rr: number, cc: number) => rr >= 0 && cc >= 0 && rr < sheet.rows && cc < sheet.cols;
    let rr = r + dr;
    let cc = c + dc;
    if (!inside(rr, cc)) return [r, c];
    if (has(r, c) && has(rr, cc)) {
      while (inside(rr + dr, cc + dc) && has(rr + dr, cc + dc)) { rr += dr; cc += dc; }
      return [rr, cc];
    }
    while (inside(rr, cc) && !has(rr, cc)) {
      if (!inside(rr + dr, cc + dc)) return [rr, cc];
      rr += dr;
      cc += dc;
    }
    return [rr, cc];
  };

  const move = (dr: number, dc: number, extend: boolean, ctrl: boolean) => {
    if (extend) {
      const [r, c] = ctrl ? jump(sel.r2, sel.c2, dr, dc) : [sel.r2 + dr, sel.c2 + dc];
      setSel({ ...sel, r1: sel.ar, c1: sel.ac, r2: r, c2: c });
    } else {
      // Al salir de una celda combinada se salta al otro lado
      const m = sheet.merges?.find((x) => sel.ar >= x.r1 && sel.ar <= x.r2 && sel.ac >= x.c1 && sel.ac <= x.c2);
      const fromR = m ? (dr > 0 ? m.r2 : dr < 0 ? m.r1 : sel.ar) : sel.ar;
      const fromC = m ? (dc > 0 ? m.c2 : dc < 0 ? m.c1 : sel.ac) : sel.ac;
      const [r, c] = ctrl ? jump(fromR, fromC, dr, dc) : [fromR + dr, fromC + dc];
      setSel({ ar: r, ac: c, r1: r, c1: c, r2: r, c2: c });
    }
  };

  const suggestions = useMemo<FnInfo[]>(() => {
    if (!edit?.text.startsWith("=")) return [];
    const el = edit.inBar ? barRef.current : editorRef.current;
    const caret = el?.selectionStart ?? edit.text.length;
    const m = /(?:^=|[(;,+\-*/^&<>=])\s*([A-Za-zÁÉÍÓÚÑáéíóúñ][A-Za-zÁÉÍÓÚÑáéíóúñ.]*)$/.exec(edit.text.slice(0, caret));
    if (!m) return [];
    const list = suggestFunctions(m[1]);
    return list.length === 1 && list[0].name === m[1].toUpperCase() ? [] : list;
  }, [edit]);

  const acceptSuggestion = (f: FnInfo) => {
    if (!edit) return;
    const el = edit.inBar ? barRef.current : editorRef.current;
    const caret = el?.selectionStart ?? edit.text.length;
    const before = edit.text.slice(0, caret).replace(/[A-Za-zÁÉÍÓÚÑáéíóúñ][A-Za-zÁÉÍÓÚÑáéíóúñ.]*$/, "");
    const text = before + f.name + "(" + edit.text.slice(caret);
    const pos = before.length + f.name.length + 1;
    setEdit({ ...edit, text, typed: false });
    setTimeout(() => {
      const t = edit.inBar ? barRef.current : editorRef.current;
      t?.focus();
      t?.setSelectionRange(pos, pos);
    });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key;
    if (edit) {
      if (suggestions.length) {
        if (k === "ArrowDown") { e.preventDefault(); setSuggestIdx((i) => (i + 1) % suggestions.length); return; }
        if (k === "ArrowUp") { e.preventDefault(); setSuggestIdx((i) => (i - 1 + suggestions.length) % suggestions.length); return; }
        if (k === "Tab" || (k === "Enter" && !mod)) { e.preventDefault(); acceptSuggestion(suggestions[Math.min(suggestIdx, suggestions.length - 1)]); return; }
      }
      if (k === "Enter" && e.altKey) {
        e.preventDefault();
        const el = e.target as HTMLTextAreaElement;
        const p = el.selectionStart;
        setEdit({ ...edit, text: edit.text.slice(0, p) + "\n" + edit.text.slice(el.selectionEnd), typed: false });
        setTimeout(() => el.setSelectionRange(p + 1, p + 1), 0);
        return;
      }
      if (k === "Enter") { e.preventDefault(); commitEdit(mod ? undefined : [e.shiftKey ? -1 : 1, 0], mod); return; }
      if (k === "Tab") { e.preventDefault(); commitEdit([0, e.shiftKey ? -1 : 1]); return; }
      if (k === "Escape") { e.preventDefault(); cancelEdit(); return; }
      if (edit.typed && !edit.text.startsWith("=") && k.startsWith("Arrow")) {
        e.preventDefault();
        commitEdit(k === "ArrowUp" ? [-1, 0] : k === "ArrowDown" ? [1, 0] : k === "ArrowLeft" ? [0, -1] : [0, 1]);
      }
      return;
    }
    if (e.target !== gridEl.current) return;
    const lower = k.toLowerCase();
    if (mod && lower === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && lower === "y") { e.preventDefault(); redo(); return; }
    if (mod && lower === "b") { e.preventDefault(); toggle("b"); return; }
    if (mod && lower === "i") { e.preventDefault(); toggle("i"); return; }
    if (mod && lower === "u") { e.preventDefault(); toggle("u"); return; }
    if (mod && lower === "a") { e.preventDefault(); setSel({ ar: sel.ar, ac: sel.ac, r1: 0, c1: 0, r2: sheet.rows - 1, c2: sheet.cols - 1 }); return; }
    if (mod && k === "Home") { e.preventDefault(); setSel({ ar: 0, ac: 0, r1: 0, c1: 0, r2: 0, c2: 0 }); return; }
    if (mod && k === "End") {
      e.preventDefault();
      const u = usedRange(sheet);
      if (u) setSel({ ar: u.r2, ac: u.c2, r1: u.r2, c1: u.c2, r2: u.r2, c2: u.c2 });
      return;
    }
    if (mod && k === "`") { e.preventDefault(); setShowFormulas((v) => !v); return; }
    if (mod && k === ";") { e.preventDefault(); commit((w) => ops.inputCell(w, w.active, sel.ar, sel.ac, new Date().toLocaleDateString("es-ES"))); return; }
    if (k.startsWith("Arrow")) {
      e.preventDefault();
      const [dr, dc] = k === "ArrowUp" ? [-1, 0] : k === "ArrowDown" ? [1, 0] : k === "ArrowLeft" ? [0, -1] : [0, 1];
      move(dr, dc, e.shiftKey, mod);
      return;
    }
    if (k === "Enter") { e.preventDefault(); move(e.shiftKey ? -1 : 1, 0, false, false); return; }
    if (k === "Tab") { e.preventDefault(); move(0, e.shiftKey ? -1 : 1, false, false); return; }
    if (k === "Home") { e.preventDefault(); setSel({ ar: sel.ar, ac: 0, r1: sel.ar, c1: 0, r2: sel.ar, c2: 0 }); return; }
    if (k === "PageDown" || k === "PageUp") {
      e.preventDefault();
      const step = Math.max(1, Math.floor((gridEl.current?.clientHeight ?? 400) / 24 / zoom) - 2) * (k === "PageDown" ? 1 : -1);
      move(step, 0, e.shiftKey, false);
      return;
    }
    if (k === "Delete" || k === "Backspace") {
      e.preventDefault();
      if (selChart) {
        commit((w) => ops.updateSheet(w, w.active, { charts: (w.sheets[w.active].charts ?? []).filter((c) => c.id !== selChart) }));
        setSelChart(null);
      } else commit((w) => ops.clearRange(w, w.active, n, "contents"));
      return;
    }
    if (k === "F2") { e.preventDefault(); startEdit(editText(activeCell?.v ?? "", activeCell?.s), false); return; }
    if (k === "Escape") { clip.current = null; setSelChart(null); return; }
    if (k.length === 1 && !mod && !e.altKey) {
      e.preventDefault();
      startEdit(k, true);
    }
  };

  // Atajos de toda la ventana
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === "s" && !e.shiftKey) { e.preventDefault(); files.save(); }
      else if (e.key === "F12") { e.preventDefault(); files.saveAs(); }
      else if (mod && k === "p") { e.preventDefault(); print(); }
      else if (mod && k === "f") { e.preventDefault(); setFindOpen({ replace: false }); }
      else if (mod && k === "h") { e.preventDefault(); setFindOpen({ replace: true }); }
      else if (mod && k === "o") {
        e.preventDefault();
        if (isDesktop()) void openFileFromDisk().then((d) => d && openDoc(d)).catch((err) => toast(err instanceof Error ? err.message : "No se pudo abrir", "error"));
        else navigate({ name: "home", section: "open" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* ---------------- Cuadrícula ---------------- */
  const measure = useMemo(() => document.createElement("canvas").getContext("2d")!, []);
  const api: GridApi = {
    setSel,
    startEdit: (text, typed) => startEdit(text, typed),
    setEdit: (e) => setEdit(e),
    commitEdit: (mv) => commitEdit(mv),
    resize: (axis, idx, size) => commit((w) => ops.setSize(w, w.active, axis, idx, size)),
    autofit: (axis, index) => {
      if (axis === "row") return commit((w) => ops.setSize(w, w.active, "row", [index], null));
      let max = 30;
      for (const k in sheet.cells) {
        const [r, c] = k.split(",").map(Number);
        if (c !== index) continue;
        const cell = sheet.cells[k];
        const s = cell.s ?? {};
        measure.font = `${s.i ? "italic " : ""}${s.b ? "700 " : ""}${(s.fs ?? 11) * 1.333}px ${s.font ?? "Inter Variable, sans-serif"}`;
        max = Math.max(max, measure.measureText(formatValue(ev.value(si, r, c), s)).width + 14);
      }
      commit((w) => ops.setSize(w, w.active, "col", [index], Math.min(600, max)));
    },
    fill: (src, dest) => {
      commit((w) => ops.fillRange(w, w.active, src, dest));
      setSel({ ...sel, r1: dest.r1, c1: dest.c1, r2: dest.r2, c2: dest.c2 });
    },
    updateChart: (cid, patch) => commit((w) => ops.updateSheet(w, w.active, { charts: (w.sheets[w.active].charts ?? []).map((c) => (c.id === cid ? { ...c, ...patch } : c)) })),
    selectChart: setSelChart,
    editChart: (cid) => {
      const c = sheet.charts?.find((x) => x.id === cid);
      if (c) setChartDialog({ id: c.id, spec: { ...c } });
    },
    onContextMenu: (x, y, kind) => setMenu({ x, y, kind }),
  };

  /* ---------------- Gráficos ---------------- */
  const newChart = (type: ChartSpec["type"] = "column") => {
    const rg = n.r1 === n.r2 && n.c1 === n.c2 ? currentRegion(sheet, sel.ar, sel.ac) : n;
    let x = 0;
    for (let c = 0; c <= rg.c2 + 1; c++) x += colWidth(sheet, c);
    let y = 0;
    for (let r = 0; r < rg.r1; r++) y += rowHeight(sheet, r);
    setChartDialog({ spec: { type, range: rangeToA1(rg), title: "", x: x + 16, y, w: 480, h: 300, legend: true } });
  };
  const saveChart = (spec: Omit<ChartSpec, "id">, id?: string) => {
    commit((w) => {
      const charts = w.sheets[w.active].charts ?? [];
      return ops.updateSheet(w, w.active, { charts: id ? charts.map((c) => (c.id === id ? { ...spec, id } : c)) : [...charts, { ...spec, id: uid() }] });
    });
    setChartDialog(null);
  };

  /* ---------------- Imprimir ---------------- */
  function print() {
    let el = document.getElementById("lumen-page-size") as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement("style");
      el.id = "lumen-page-size";
      document.head.appendChild(el);
    }
    el.textContent = "@page { size: A4 landscape; margin: 12mm; }";
    setPrinting(true);
  }
  const [printHtml, setPrintHtml] = useState<string | null>(null);
  useEffect(() => {
    if (!printing) return;
    let cancelled = false;
    void import("@/lib/sheet/xlsx").then(({ sheetHtml }) => {
      if (cancelled) return;
      setPrintHtml(sheetHtml(wbRef.current, wbRef.current.active));
      // Se espera a que la tabla esté en la página antes de imprimir
      setTimeout(() => {
        window.print();
        setPrinting(false);
        setPrintHtml(null);
      }, 80);
    });
    return () => {
      cancelled = true;
    };
  }, [printing]);

  /* ---------------- Barra de fórmulas ---------------- */
  const barValue = edit ? edit.text : showFormulas || !activeCell ? (activeCell?.v ?? "") : editText(activeCell.v, activeCell.s);
  const [nameBox, setNameBox] = useState<string | null>(null);
  const goTo = (text: string) => {
    const rg = parseRange(text.trim().toUpperCase());
    setNameBox(null);
    if (!rg) return toast("Escribe una celda o un rango, por ejemplo B4 o A1:C10", "error");
    setSel({ ar: rg.r1, ac: rg.c1, ...rg });
    focusGrid();
  };

  // Estadísticas de la selección
  const stats = useMemo(() => {
    if (n.r1 === n.r2 && n.c1 === n.c2) return null;
    let sum = 0;
    let count = 0;
    let nums = 0;
    let min = Infinity;
    let max = -Infinity;
    const r2 = Math.min(n.r2, (usedRange(sheet)?.r2 ?? 0));
    const c2 = Math.min(n.c2, (usedRange(sheet)?.c2 ?? 0));
    for (let r = n.r1; r <= r2; r++)
      for (let c = n.c1; c <= c2; c++) {
        const v: Scalar = ev.value(si, r, c);
        if (v === null || v === "") continue;
        count++;
        if (typeof v === "number") {
          nums++;
          sum += v;
          min = Math.min(min, v);
          max = Math.max(max, v);
        }
      }
    return { sum, count, nums, avg: nums ? sum / nums : 0, min, max };
  }, [n.r1, n.r2, n.c1, n.c2, sheet, ev, si]);

  const fmtStat = (x: number) => x.toLocaleString("es-ES", { maximumFractionDigits: 4 });
  const selLabel = n.r1 === n.r2 && n.c1 === n.c2 ? addr(sel.ar, sel.ac) : `${addr(n.r1, n.c1)}:${addr(n.r2, n.c2)}`;

  const onGridReady = useCallback((el: HTMLDivElement) => {
    gridEl.current = el;
    el.focus({ preventScroll: true });
  }, []);

  const tabs: { id: Tab; label: string }[] = [
    { id: "home", label: "Inicio" },
    { id: "insert", label: "Insertar" },
    { id: "formulas", label: "Fórmulas" },
    { id: "data", label: "Datos" },
    { id: "view", label: "Vista" },
    { id: "ai", label: "IA" },
  ];

  return (
    <>
      <div className="sheet-app flex h-full flex-col bg-bg" onKeyDown={onKeyDown}>
        <OfficeHeader
          doc={doc}
          title={title}
          onTitle={setTitle}
          placeholder="Hoja de cálculo sin título"
          saveState={saveState}
          diskState={diskState}
          unsavedFile={unsavedFile}
          files={files}
          icon={<FileSpreadsheet />}
        >
          <Button size="sm" variant="primary" icon={<Sparkles className="size-3.5" />} onClick={() => setTab("ai")}>
            IA
          </Button>
        </OfficeHeader>

        {/* Cinta */}
        <div className="no-print shrink-0 border-b border-border bg-surface">
          <RibbonTabs
            tabs={tabs}
            active={tab}
            onChange={setTab}
            left={
              <OfficeFileMenu
                files={files}
                saveLabel="(.xlsx)"
                onPrint={print}
                exports={[
                  { label: "Excel (.xlsx)", icon: <FileSpreadsheet />, onSelect: () => files.exportAs("xlsx") },
                  { label: "CSV de la hoja actual (.csv)", icon: <FileText />, onSelect: () => files.exportAs("csv") },
                  { label: "PDF (mediante Imprimir)", icon: <Printer />, onSelect: print },
                ]}
              />
            }
            right={
              <>
                <IconButton size="sm" label="Deshacer" shortcut="Ctrl+Z" onClick={undo} disabled={!undoStack.current.length}>
                  <Undo2 className="size-4" />
                </IconButton>
                <IconButton size="sm" label="Rehacer" shortcut="Ctrl+Y" onClick={redo} disabled={!redoStack.current.length}>
                  <Redo2 className="size-4" />
                </IconButton>
              </>
            }
          />
          <div
            className="flex h-[92px] items-stretch overflow-x-auto overflow-y-hidden border-t border-border px-2 pt-1.5 pb-1"
            onWheel={(e) => {
              if (e.deltaY) e.currentTarget.scrollLeft += e.deltaY;
            }}
            onMouseUp={() => {
              if (!edit) focusGrid();
            }}
          >
            {tab === "home" && (
              <>
                <RGroup label="Portapapeles">
                  <Menu>
                    <MenuTrigger asChild>
                      <button className="flex h-full min-w-[54px] flex-col items-center justify-center gap-1 rounded-md px-1.5 text-[11.5px] hover:bg-surface-2">
                        <ClipboardPaste className="size-[22px]" />
                        <span className="flex items-center gap-0.5">Pegar <ChevronDown className="size-3" /></span>
                      </button>
                    </MenuTrigger>
                    <MenuContent>
                      <MenuItem icon={<ClipboardPaste />} shortcut="Ctrl+V" onSelect={() => void ribbonPaste("all")}>Pegar</MenuItem>
                      <MenuItem icon={<Hash />} onSelect={() => void ribbonPaste("values")}>Pegar solo valores</MenuItem>
                      <MenuItem icon={<PaintBucket />} onSelect={() => void ribbonPaste("formats")}>Pegar solo formato</MenuItem>
                    </MenuContent>
                  </Menu>
                  <div className="flex flex-col">
                    <IconButton size="sm" label="Cortar" shortcut="Ctrl+X" onClick={() => void navigator.clipboard?.writeText(copy(true)).catch(() => {})}><Scissors className="size-4" /></IconButton>
                    <IconButton size="sm" label="Copiar" shortcut="Ctrl+C" onClick={() => void navigator.clipboard?.writeText(copy(false)).catch(() => {})}><Copy className="size-4" /></IconButton>
                  </div>
                </RGroup>
                <RGroup label="Fuente" className="flex-col items-start justify-center gap-1">
                  <div className="flex items-center gap-1">
                    <FontPicker value={st.font ?? null} onChange={(css) => style({ font: css })} className="w-[150px]" placeholder="Predeterminada" />
                    <FontSizePicker value={st.fs ?? 11} onChange={(pt) => style({ fs: pt === 11 ? undefined : pt })} />
                  </div>
                  <div className="flex items-center gap-0.5">
                    <IconButton size="sm" label="Negrita" shortcut="Ctrl+B" active={!!st.b} onClick={() => toggle("b")}><Bold className="size-4" /></IconButton>
                    <IconButton size="sm" label="Cursiva" shortcut="Ctrl+I" active={!!st.i} onClick={() => toggle("i")}><Italic className="size-4" /></IconButton>
                    <IconButton size="sm" label="Subrayado" shortcut="Ctrl+U" active={!!st.u} onClick={() => toggle("u")}><Underline className="size-4" /></IconButton>
                    <IconButton size="sm" label="Tachado" active={!!st.s} onClick={() => toggle("s")}><Strikethrough className="size-4" /></IconButton>
                    <BorderMenu onPick={(m) => commit((w) => ops.borderRange(w, w.active, n, m))} />
                    <ColorButton label="Color de relleno" icon={<PaintBucket />} color={st.bg ?? "#fff2a8"} onApply={(c) => style({ bg: c })} onClear={() => style({ bg: undefined })} clearLabel="Sin relleno" />
                    <ColorButton label="Color del texto" icon={<Type />} color={st.color ?? "#d93025"} onApply={(c) => style({ color: c })} onClear={() => style({ color: undefined })} />
                  </div>
                </RGroup>
                <RGroup label="Alineación" className="flex-col items-start justify-center gap-1">
                  <div className="flex items-center gap-0.5">
                    <IconButton size="sm" label="Arriba" active={st.valign === "top"} onClick={() => style({ valign: st.valign === "top" ? undefined : "top" })}><ArrowUpToLine className="size-4" /></IconButton>
                    <IconButton size="sm" label="En medio" active={st.valign === "middle"} onClick={() => style({ valign: st.valign === "middle" ? undefined : "middle" })}><FoldVertical className="size-4" /></IconButton>
                    <IconButton size="sm" label="Abajo" active={!st.valign || st.valign === "bottom"} onClick={() => style({ valign: undefined })}><ArrowDownToLine className="size-4" /></IconButton>
                    <IconButton size="sm" label="Ajustar texto" active={!!st.wrap} onClick={() => toggle("wrap")}><WrapText className="size-4" /></IconButton>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <IconButton size="sm" label="Izquierda" active={st.align === "left"} onClick={() => style({ align: st.align === "left" ? undefined : "left" })}><AlignLeft className="size-4" /></IconButton>
                    <IconButton size="sm" label="Centrar" active={st.align === "center"} onClick={() => style({ align: st.align === "center" ? undefined : "center" })}><AlignCenter className="size-4" /></IconButton>
                    <IconButton size="sm" label="Derecha" active={st.align === "right"} onClick={() => style({ align: st.align === "right" ? undefined : "right" })}><AlignRight className="size-4" /></IconButton>
                    <IconButton size="sm" label="Combinar y centrar" onClick={() => commit((w) => ops.toggleMerge(w, w.active, n))}><Merge className="size-4" /></IconButton>
                  </div>
                </RGroup>
                <RGroup label="Número" className="flex-col items-start justify-center gap-1">
                  <Menu>
                    <MenuTrigger asChild>
                      <button className="flex h-8 w-[150px] items-center justify-between rounded-md border border-border bg-surface px-2 text-[12.5px] hover:border-accent/50">
                        {NUM_FORMATS.find((f) => f.id === (st.fmt ?? "general"))?.label}
                        <ChevronDown className="size-3.5 text-muted" />
                      </button>
                    </MenuTrigger>
                    <MenuContent className="w-[240px]">
                      {NUM_FORMATS.map((f) => (
                        <MenuItem key={f.id} onSelect={() => style({ fmt: f.id === "general" ? undefined : (f.id as NumFmt), dec: undefined })} shortcut={f.example}>
                          {f.label}
                        </MenuItem>
                      ))}
                    </MenuContent>
                  </Menu>
                  <div className="flex items-center gap-0.5">
                    <IconButton size="sm" label="Moneda (€)" active={st.fmt === "currency"} onClick={() => style({ fmt: st.fmt === "currency" ? undefined : "currency" })}><Euro className="size-4" /></IconButton>
                    <IconButton size="sm" label="Porcentaje" active={st.fmt === "percent"} onClick={() => style({ fmt: st.fmt === "percent" ? undefined : "percent", dec: st.fmt === "percent" ? undefined : 0 })}><Percent className="size-4" /></IconButton>
                    <IconButton size="sm" label="Separador de miles" active={st.fmt === "thousands"} onClick={() => style({ fmt: st.fmt === "thousands" ? undefined : "thousands" })}><span className="text-[12px] font-semibold">000</span></IconButton>
                    <IconButton size="sm" label="Más decimales" onClick={() => style((s) => ({ ...s, dec: Math.min(10, (s.dec ?? defaultDec(s.fmt)) + 1) }))}><span className="text-[11px] font-semibold">,0→</span></IconButton>
                    <IconButton size="sm" label="Menos decimales" onClick={() => style((s) => ({ ...s, dec: Math.max(0, (s.dec ?? defaultDec(s.fmt)) - 1) }))}><span className="text-[11px] font-semibold">←,0</span></IconButton>
                  </div>
                </RGroup>
                <RGroup label="Celdas">
                  <Menu>
                    <MenuTrigger asChild>
                      <span><RBig icon={<Plus />} label="Insertar" /></span>
                    </MenuTrigger>
                    <MenuContent>
                      <MenuItem icon={<Rows3 />} onSelect={() => insertLines("row", "before")}>Insertar filas encima</MenuItem>
                      <MenuItem icon={<Rows3 />} onSelect={() => insertLines("row", "after")}>Insertar filas debajo</MenuItem>
                      <MenuItem icon={<Columns3 />} onSelect={() => insertLines("col", "before")}>Insertar columnas a la izquierda</MenuItem>
                      <MenuItem icon={<Columns3 />} onSelect={() => insertLines("col", "after")}>Insertar columnas a la derecha</MenuItem>
                      <MenuSeparator />
                      <MenuItem icon={<Plus />} onSelect={() => commit((w) => ops.addSheet(w))}>Insertar hoja</MenuItem>
                    </MenuContent>
                  </Menu>
                  <Menu>
                    <MenuTrigger asChild>
                      <span><RBig icon={<Minus />} label="Eliminar" /></span>
                    </MenuTrigger>
                    <MenuContent>
                      <MenuItem icon={<Rows3 />} onSelect={() => deleteLines("row")}>Eliminar filas</MenuItem>
                      <MenuItem icon={<Columns3 />} onSelect={() => deleteLines("col")}>Eliminar columnas</MenuItem>
                    </MenuContent>
                  </Menu>
                </RGroup>
                <RGroup label="Edición">
                  <AutoSumMenu onPick={autoSum} big />
                  <div className="flex flex-col">
                    <Menu>
                      <MenuTrigger asChild>
                        <span><IconButton size="sm" label="Borrar"><Eraser className="size-4" /></IconButton></span>
                      </MenuTrigger>
                      <MenuContent>
                        <MenuItem icon={<Eraser />} onSelect={() => commit((w) => ops.clearRange(w, w.active, n, "all"))}>Borrar todo</MenuItem>
                        <MenuItem icon={<Type />} shortcut="Supr" onSelect={() => commit((w) => ops.clearRange(w, w.active, n, "contents"))}>Borrar contenido</MenuItem>
                        <MenuItem icon={<Highlighter />} onSelect={() => commit((w) => ops.clearRange(w, w.active, n, "formats"))}>Borrar formato</MenuItem>
                      </MenuContent>
                    </Menu>
                    <IconButton size="sm" label="Buscar y reemplazar" shortcut="Ctrl+F" onClick={() => setFindOpen({ replace: false })}><Search className="size-4" /></IconButton>
                  </div>
                  <div className="flex flex-col">
                    <IconButton size="sm" label="Ordenar de A a Z" onClick={() => sort(true)}><ArrowDownAZ className="size-4" /></IconButton>
                    <IconButton size="sm" label="Ordenar de Z a A" onClick={() => sort(false)}><ArrowDownZA className="size-4" /></IconButton>
                  </div>
                </RGroup>
              </>
            )}

            {tab === "insert" && (
              <>
                <RGroup label="Gráficos">
                  {CHART_TYPES.slice(0, 5).map((t) => (
                    <RBig key={t.id} icon={<ChartIcon type={t.id} />} label={t.label} onClick={() => newChart(t.id)} title={`Gráfico de ${t.label.toLowerCase()} con los datos seleccionados`} />
                  ))}
                  <RBig icon={<BarChart3 />} label="Más…" onClick={() => newChart("doughnut")} />
                </RGroup>
                <RGroup label="Celdas">
                  <RBig icon={<Rows3 />} label="Fila" onClick={() => insertLines("row", "before")} title="Insertar filas encima" />
                  <RBig icon={<Columns3 />} label="Columna" onClick={() => insertLines("col", "before")} title="Insertar columnas a la izquierda" />
                  <RBig icon={<Table2 />} label="Hoja" onClick={() => commit((w) => ops.addSheet(w))} />
                </RGroup>
                <RGroup label="Datos">
                  <RBig icon={<SquareFunction />} label="Función" onClick={() => setFnDialog(true)} />
                  <RBig icon={<Calendar />} label="Fecha de hoy" onClick={() => commit((w) => ops.inputCell(w, w.active, sel.ar, sel.ac, "=HOY()"))} title="Inserta =HOY() en la celda" />
                </RGroup>
              </>
            )}

            {tab === "formulas" && (
              <>
                <RGroup label="Biblioteca de funciones">
                  <RBig icon={<SquareFunction />} label="Insertar función" onClick={() => setFnDialog(true)} />
                  <AutoSumMenu onPick={autoSum} big />
                  {(["Matemáticas", "Lógicas", "Texto", "Fecha y hora", "Búsqueda", "Financieras"] as const).map((cat) => (
                    <Menu key={cat}>
                      <MenuTrigger asChild>
                        <span><RBig icon={<span className="text-[15px] font-bold">fx</span>} label={cat} /></span>
                      </MenuTrigger>
                      <MenuContent className="max-h-[360px] w-[300px] overflow-y-auto">
                        {FN_INFO.filter((f) => f.cat === cat || (cat === "Matemáticas" && f.cat === "Estadística")).map((f) => (
                          <MenuItem key={f.name} onSelect={() => setEdit({ r: sel.ar, c: sel.ac, text: `=${f.name}(`, typed: false, inBar: false })}>
                            <div>
                              <div className="font-medium">{f.name}</div>
                              <div className="text-[11.5px] text-muted">{f.desc}</div>
                            </div>
                          </MenuItem>
                        ))}
                      </MenuContent>
                    </Menu>
                  ))}
                </RGroup>
                <RGroup label="Cálculo">
                  <RBig icon={<Eye />} label="Mostrar fórmulas" active={showFormulas} onClick={() => setShowFormulas((v) => !v)} title="Ctrl+`" />
                  <RBig icon={<RefreshCw />} label="Recalcular" onClick={() => setRecalc((x) => x + 1)} title="Vuelve a calcular HOY, AHORA y ALEATORIO" />
                </RGroup>
              </>
            )}

            {tab === "data" && (
              <>
                <RGroup label="Ordenar">
                  <RBig icon={<ArrowDownAZ />} label="De A a Z" onClick={() => sort(true)} />
                  <RBig icon={<ArrowDownZA />} label="De Z a A" onClick={() => sort(false)} />
                </RGroup>
                <RGroup label="Herramientas">
                  <RBig icon={<CopyX />} label="Quitar duplicados" onClick={removeDuplicates} />
                </RGroup>
                <RGroup label="Inmovilizar">
                  <RBig icon={<Lock />} label="Fila superior" active={sheet.freezeR === 1 && !sheet.freezeC} onClick={() => freeze(1, 0)} />
                  <RBig icon={<Lock />} label="Primera columna" active={sheet.freezeC === 1 && !sheet.freezeR} onClick={() => freeze(0, 1)} />
                  <RBig icon={<Lock />} label="Hasta la selección" onClick={() => freeze(sel.ar, sel.ac)} title="Las filas de encima y las columnas de la izquierda de la celda activa" />
                  <RBig icon={<X />} label="Movilizar" disabled={!sheet.freezeR && !sheet.freezeC} onClick={() => freeze(0, 0)} />
                </RGroup>
              </>
            )}

            {tab === "view" && (
              <>
                <RGroup label="Mostrar">
                  <RBig icon={<Grid3x3 />} label="Líneas de cuadrícula" active={sheet.showGrid !== false} onClick={() => commit((w) => ops.updateSheet(w, w.active, { showGrid: sheet.showGrid === false }))} />
                  <RBig icon={<Eye />} label="Fórmulas" active={showFormulas} onClick={() => setShowFormulas((v) => !v)} />
                </RGroup>
                <RGroup label="Zoom">
                  <RBig icon={<Minus />} label="Alejar" onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.1) * 10) / 10))} />
                  <RBig icon={<Square />} label="100 %" onClick={() => setZoom(1)} />
                  <RBig icon={<Plus />} label="Acercar" onClick={() => setZoom((z) => Math.min(2, Math.round((z + 0.1) * 10) / 10))} />
                </RGroup>
                <RGroup label="Inmovilizar">
                  <RBig icon={<Lock />} label="Fila superior" onClick={() => freeze(1, 0)} />
                  <RBig icon={<X />} label="Movilizar" disabled={!sheet.freezeR && !sheet.freezeC} onClick={() => freeze(0, 0)} />
                </RGroup>
              </>
            )}

            {tab === "ai" && (
              <RGroup label="Asistente">
                <RBig icon={<SquareFunction />} label="Fórmula con IA" onClick={() => setAiDialog("formula")} title="Describe lo que quieres calcular y la IA escribe la fórmula" />
                <RBig icon={<BarChart3 />} label="Analizar datos" onClick={() => setAiDialog("analyze")} title="Resumen y conclusiones de los datos seleccionados" />
                <RBig icon={<Table2 />} label="Generar tabla" onClick={() => setAiDialog("generate")} title="Crea una tabla de datos a partir de una descripción" />
              </RGroup>
            )}
          </div>
        </div>

        {/* Barra de fórmulas */}
        <div className="no-print relative flex h-9 shrink-0 items-center gap-2 border-b border-border bg-surface px-2">
          <input
            value={nameBox ?? selLabel}
            onChange={(e) => setNameBox(e.target.value)}
            onFocus={(e) => e.target.select()}
            onBlur={() => setNameBox(null)}
            onKeyDown={(e) => {
              if (e.key === "Enter") goTo(nameBox ?? selLabel);
              else if (e.key === "Escape") { setNameBox(null); focusGrid(); }
            }}
            className="h-7 w-[92px] rounded-md border border-border bg-surface px-2 text-center text-[12.5px] font-medium outline-none focus:border-accent"
            aria-label="Cuadro de nombres"
          />
          <Tooltip label="Insertar función">
            <button onClick={() => setFnDialog(true)} className="grid h-7 w-8 place-items-center rounded-md text-[13px] font-bold text-muted italic hover:bg-surface-2 hover:text-text">
              fx
            </button>
          </Tooltip>
          <input
            ref={barRef}
            value={barValue}
            onFocus={() => {
              if (!editRef.current) startEdit(editText(activeCell?.v ?? "", activeCell?.s), false, true);
              else if (!editRef.current.inBar) setEdit({ ...editRef.current, inBar: true });
            }}
            onChange={(e) => setEdit({ ...(editRef.current ?? { r: sel.ar, c: sel.ac, typed: false }), text: e.target.value, inBar: true, pick: undefined })}
            onKeyDown={onKeyDown}
            spellCheck={false}
            className="h-7 min-w-0 flex-1 rounded-md border border-border bg-surface px-2 font-mono text-[13px] outline-none focus:border-accent"
            aria-label="Barra de fórmulas"
            placeholder="Escribe un valor o una fórmula que empiece por ="
          />
          {suggestions.length > 0 && (
            <div className="absolute top-9 left-[140px] z-30 w-[380px] animate-pop-in rounded-[var(--radius)] border border-border bg-surface p-1 shadow-soft">
              {suggestions.map((f, i) => (
                <button
                  key={f.name}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    acceptSuggestion(f);
                  }}
                  className={cn("flex w-full flex-col items-start rounded-md px-2.5 py-1.5 text-left", i === Math.min(suggestIdx, suggestions.length - 1) ? "bg-accent-soft" : "hover:bg-surface-2")}
                >
                  <span className="font-mono text-[12.5px] font-semibold">{f.syntax}</span>
                  <span className="text-[11.5px] text-muted">{f.desc}</span>
                </button>
              ))}
              <div className="px-2.5 pt-1 pb-0.5 text-[10.5px] text-muted">Tab o Intro para elegir · los argumentos se separan con «;»</div>
            </div>
          )}
        </div>

        {/* Hoja */}
        <div className="relative flex min-h-0 flex-1 flex-col">
          <Grid
            sheet={sheet}
            si={si}
            ev={ev}
            sel={sel}
            edit={edit}
            zoom={zoom}
            showFormulas={showFormulas}
            selChart={selChart}
            api={api}
            onReady={onGridReady}
            editorRef={editorRef}
            find={findHit}
          />
          {findOpen && (
            <FindPanel
              sheet={sheet}
              display={displayAt}
              replace={findOpen.replace}
              onClose={() => {
                setFindOpen(null);
                setFindHit(null);
                focusGrid();
              }}
              onHit={(hit) => {
                setFindHit(hit);
                if (hit) setSel({ ar: hit[0], ac: hit[1], r1: hit[0], c1: hit[1], r2: hit[0], c2: hit[1] });
              }}
              onReplace={(cells, from, to) => {
                commit((w) => {
                  let out = w;
                  for (const [r, c] of cells) {
                    const cur = out.sheets[out.active].cells[key(r, c)];
                    if (!cur) continue;
                    const next = cur.v.split(from).join(to);
                    if (next !== cur.v) out = ops.inputCell(out, out.active, r, c, next);
                  }
                  return out;
                });
                toast(`${cells.length} reemplazo${cells.length === 1 ? "" : "s"}`, "success");
              }}
            />
          )}
        </div>

        {/* Pestañas de hojas y barra de estado */}
        <div className="no-print flex h-9 shrink-0 items-center gap-1 border-t border-border bg-surface px-2 text-[12.5px]">
          <IconButton size="sm" label="Nueva hoja" onClick={() => commit((w) => ops.addSheet(w))}>
            <Plus className="size-4" />
          </IconButton>
          <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
            {wb.sheets.map((s, i) => (
              <SheetTab
                key={s.id}
                name={s.name}
                active={i === si}
                onSelect={() => {
                  if (edit) commitEdit();
                  commit((w) => (w.active === i ? w : { ...w, active: i }));
                  setSel({ ar: 0, ac: 0, r1: 0, c1: 0, r2: 0, c2: 0 });
                  setSelChart(null);
                }}
                onRename={(name) => commit((w) => ops.renameSheet(w, i, name))}
                onMenu={(x, y) => setMenu({ x, y, kind: "tab", tab: i })}
              />
            ))}
          </div>
          {stats && (
            <div className="flex shrink-0 items-center gap-3 text-muted">
              {stats.nums > 0 && <span>Promedio: <b className="font-medium text-text">{fmtStat(stats.avg)}</b></span>}
              <span>Recuento: <b className="font-medium text-text">{stats.count}</b></span>
              {stats.nums > 0 && <span>Suma: <b className="font-medium text-text">{fmtStat(stats.sum)}</b></span>}
            </div>
          )}
          <div className="ml-3 flex w-[150px] shrink-0 items-center gap-2">
            <Slider value={zoom * 100} min={50} max={200} step={10} onChange={(v) => setZoom(v / 100)} label="Zoom" />
            <span className="w-10 text-right text-muted tabular-nums">{Math.round(zoom * 100)} %</span>
          </div>
        </div>
      </div>

      {menu && (
        <FloatingMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
          {menu.kind === "tab" ? (
            <>
              <FItem icon={<Copy />} onClick={() => commit((w) => ops.duplicateSheet(w, menu.tab!))}>Duplicar hoja</FItem>
              <FItem icon={<ChevronDown className="rotate-90" />} onClick={() => commit((w) => ops.moveSheet(w, menu.tab!, menu.tab! - 1))}>Mover a la izquierda</FItem>
              <FItem icon={<ChevronDown className="-rotate-90" />} onClick={() => commit((w) => ops.moveSheet(w, menu.tab!, menu.tab! + 1))}>Mover a la derecha</FItem>
              <FSep />
              <FItem
                icon={<Trash2 />}
                danger
                disabled={wb.sheets.length <= 1}
                onClick={() => {
                  if (confirm(`¿Eliminar la hoja «${wb.sheets[menu.tab!].name}»? Se puede deshacer con Ctrl+Z.`)) commit((w) => ops.deleteSheet(w, menu.tab!));
                }}
              >
                Eliminar hoja
              </FItem>
            </>
          ) : (
            <>
              <FItem icon={<Scissors />} shortcut="Ctrl+X" onClick={() => void navigator.clipboard?.writeText(copy(true)).catch(() => {})}>Cortar</FItem>
              <FItem icon={<Copy />} shortcut="Ctrl+C" onClick={() => void navigator.clipboard?.writeText(copy(false)).catch(() => {})}>Copiar</FItem>
              <FItem icon={<ClipboardPaste />} shortcut="Ctrl+V" onClick={() => void ribbonPaste("all")}>Pegar</FItem>
              <FItem icon={<Hash />} onClick={() => void ribbonPaste("values")}>Pegar solo valores</FItem>
              <FSep />
              {menu.kind !== "col" && (
                <>
                  <FItem icon={<Rows3 />} onClick={() => insertLines("row", "before")}>Insertar filas encima</FItem>
                  <FItem icon={<Rows3 />} onClick={() => insertLines("row", "after")}>Insertar filas debajo</FItem>
                  <FItem icon={<Trash2 />} onClick={() => deleteLines("row")}>Eliminar filas</FItem>
                </>
              )}
              {menu.kind !== "row" && (
                <>
                  <FItem icon={<Columns3 />} onClick={() => insertLines("col", "before")}>Insertar columnas a la izquierda</FItem>
                  <FItem icon={<Columns3 />} onClick={() => insertLines("col", "after")}>Insertar columnas a la derecha</FItem>
                  <FItem icon={<Trash2 />} onClick={() => deleteLines("col")}>Eliminar columnas</FItem>
                </>
              )}
              <FSep />
              <FItem icon={<Eraser />} onClick={() => commit((w) => ops.clearRange(w, w.active, n, "contents"))}>Borrar contenido</FItem>
              <FItem icon={<ArrowDownAZ />} onClick={() => sort(true)}>Ordenar de A a Z</FItem>
              <FItem icon={<ArrowDownZA />} onClick={() => sort(false)}>Ordenar de Z a A</FItem>
              <FItem icon={<BarChart3 />} onClick={() => newChart("column")}>Insertar gráfico</FItem>
            </>
          )}
        </FloatingMenu>
      )}

      {chartDialog && (
        <ChartDialog
          initial={chartDialog.spec}
          editing={!!chartDialog.id}
          ev={ev}
          si={si}
          onClose={() => setChartDialog(null)}
          onSave={(spec) => saveChart(spec, chartDialog.id)}
          onDelete={() => {
            commit((w) => ops.updateSheet(w, w.active, { charts: (w.sheets[w.active].charts ?? []).filter((c) => c.id !== chartDialog.id) }));
            setChartDialog(null);
          }}
        />
      )}
      {fnDialog && (
        <FunctionDialog
          onClose={() => setFnDialog(false)}
          onPick={(f) => {
            setFnDialog(false);
            setEdit({ r: sel.ar, c: sel.ac, text: `=${f.name}(`, typed: false, inBar: false });
          }}
        />
      )}
      {aiDialog && (
        <SheetAIDialog
          mode={aiDialog}
          wb={wb}
          ev={ev}
          sel={n}
          active={addr(sel.ar, sel.ac)}
          onClose={() => setAiDialog(null)}
          onFormula={(f) => {
            commit((w) => ops.inputCell(w, w.active, sel.ar, sel.ac, f));
            setAiDialog(null);
            toast(`Fórmula insertada en ${addr(sel.ar, sel.ac)}`, "success");
          }}
          onTable={(tsv) => {
            commit((w) => ops.pasteText(w, w.active, sel.ar, sel.ac, tsv));
            setAiDialog(null);
            toast("Tabla insertada", "success");
          }}
        />
      )}
      {printing && printHtml !== null &&
        createPortal(
          <div className="sheet-print">
            <section>
              <h2>{title || "Hoja de cálculo"} · {sheet.name}</h2>
              <div dangerouslySetInnerHTML={{ __html: printHtml }} />
            </section>
          </div>,
          document.body,
        )}
    </>
  );
}

const defaultDec = (fmt?: NumFmt) => (fmt === "number" || fmt === "thousands" || fmt === "currency" || fmt === "percent" ? 2 : 0);

/* ------------------------------------------------------------------ */
/*  Piezas                                                             */
/* ------------------------------------------------------------------ */

function ChartIcon({ type }: { type: ChartSpec["type"] }) {
  const common = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (type) {
    case "bar":
      return <svg {...common}><path d="M4 5h9M4 10h14M4 15h7M4 20h11" /></svg>;
    case "line":
      return <svg {...common}><path d="M3 18l5-6 4 3 8-9" /></svg>;
    case "area":
      return <svg {...common}><path d="M3 20V14l5-5 4 3 8-7v15z" fill="currentColor" fillOpacity={0.25} /></svg>;
    case "pie":
      return <svg {...common}><circle cx="12" cy="12" r="8" /><path d="M12 4v8h8" /></svg>;
    default:
      return <svg {...common}><path d="M5 20v-7M10 20V6M15 20v-10M20 20v-4M3 20h18" /></svg>;
  }
}

function AutoSumMenu({ onPick, big }: { onPick: (f: "SUMA" | "PROMEDIO" | "CONTAR" | "MAX" | "MIN") => void; big?: boolean }) {
  return (
    <Menu>
      <MenuTrigger asChild>
        {big ? (
          <span><RBig icon={<Sigma />} label="Autosuma" /></span>
        ) : (
          <span><IconButton size="sm" label="Autosuma"><Sigma className="size-4" /></IconButton></span>
        )}
      </MenuTrigger>
      <MenuContent>
        <MenuItem icon={<Sigma />} onSelect={() => onPick("SUMA")}>Suma</MenuItem>
        <MenuItem onSelect={() => onPick("PROMEDIO")}>Promedio</MenuItem>
        <MenuItem onSelect={() => onPick("CONTAR")}>Contar números</MenuItem>
        <MenuItem onSelect={() => onPick("MAX")}>Máximo</MenuItem>
        <MenuItem onSelect={() => onPick("MIN")}>Mínimo</MenuItem>
      </MenuContent>
    </Menu>
  );
}

function BorderMenu({ onPick }: { onPick: (m: "all" | "outer" | "bottom" | "top" | "none") => void }) {
  return (
    <Menu>
      <MenuTrigger asChild>
        <span><IconButton size="sm" label="Bordes"><Grid3x3 className="size-4" /></IconButton></span>
      </MenuTrigger>
      <MenuContent>
        <MenuLabel>Bordes</MenuLabel>
        <MenuItem icon={<Grid3x3 />} onSelect={() => onPick("all")}>Todos los bordes</MenuItem>
        <MenuItem icon={<Square />} onSelect={() => onPick("outer")}>Borde exterior</MenuItem>
        <MenuItem icon={<ArrowDownToLine />} onSelect={() => onPick("bottom")}>Borde inferior</MenuItem>
        <MenuItem icon={<ArrowUpToLine />} onSelect={() => onPick("top")}>Borde superior</MenuItem>
        <MenuSeparator />
        <MenuItem icon={<X />} onSelect={() => onPick("none")}>Sin bordes</MenuItem>
      </MenuContent>
    </Menu>
  );
}

function SheetTab({ name, active, onSelect, onRename, onMenu }: { name: string; active: boolean; onSelect: () => void; onRename: (n: string) => void; onMenu: (x: number, y: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          onRename(draft);
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setDraft(name);
            setEditing(false);
          }
        }}
        className="h-7 w-[110px] rounded-md border border-accent bg-surface px-2 text-[12.5px] outline-none"
      />
    );
  }
  return (
    <button
      onClick={onSelect}
      onDoubleClick={() => {
        setDraft(name);
        setEditing(true);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onSelect();
        onMenu(e.clientX, e.clientY);
      }}
      title="Doble clic para cambiar el nombre"
      className={cn(
        "h-7 shrink-0 rounded-md px-3 font-medium whitespace-nowrap transition-colors",
        active ? "bg-accent-soft text-accent shadow-[inset_0_-2px_0_var(--accent)]" : "text-muted hover:bg-surface-2 hover:text-text",
      )}
    >
      {name}
    </button>
  );
}

function FloatingMenu({ x, y, onClose, children }: { x: number; y: number; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  useEffect(() => {
    const el = ref.current;
    if (el) {
      const r = el.getBoundingClientRect();
      setPos({ x: Math.min(x, window.innerWidth - r.width - 8), y: Math.min(y, window.innerHeight - r.height - 8) });
    }
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [x, y, onClose]);
  return createPortal(
    <div
      ref={ref}
      className="fixed z-[90] min-w-[230px] animate-pop-in rounded-[var(--radius)] border border-border bg-surface p-1 text-text shadow-soft"
      style={{ left: pos.x, top: pos.y }}
      onClick={onClose}
    >
      {children}
    </div>,
    document.body,
  );
}

function FItem({ icon, children, onClick, danger, disabled, shortcut }: { icon?: ReactNode; children: ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean; shortcut?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn("flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] hover:bg-surface-2 disabled:opacity-40", danger && "text-red-500")}
    >
      <span className="flex w-4 justify-center text-muted [&>svg]:size-4">{icon}</span>
      <span className="flex-1">{children}</span>
      {shortcut && <span className="text-[11.5px] text-muted">{shortcut}</span>}
    </button>
  );
}
const FSep = () => <div className="my-1 h-px bg-border" />;

/* ---------------- Buscar y reemplazar ---------------- */

function FindPanel({
  sheet,
  display,
  replace,
  onClose,
  onHit,
  onReplace,
}: {
  sheet: Sheet;
  display: (r: number, c: number) => string;
  replace: boolean;
  onClose: () => void;
  onHit: (hit: [number, number] | null) => void;
  onReplace: (cells: [number, number][], from: string, to: string) => void;
}) {
  const [q, setQ] = useState("");
  const [rep, setRep] = useState("");
  const [showRep, setShowRep] = useState(replace);
  const [idx, setIdx] = useState(0);
  const hits = useMemo(() => {
    if (!q) return [] as [number, number][];
    const needle = q.toLowerCase();
    return Object.keys(sheet.cells)
      .map((k) => k.split(",").map(Number) as [number, number])
      .filter(([r, c]) => display(r, c).toLowerCase().includes(needle) || sheet.cells[key(r, c)].v.toLowerCase().includes(needle))
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  }, [q, sheet, display]);
  useEffect(() => {
    const i = Math.min(idx, Math.max(0, hits.length - 1));
    onHit(hits[i] ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hits, idx]);
  const go = (d: number) => hits.length && setIdx((i) => (i + d + hits.length) % hits.length);
  return (
    <div className="absolute top-2 right-5 z-20 w-[340px] animate-pop-in rounded-[var(--radius)] border border-border bg-surface p-2.5 shadow-soft" onKeyDown={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-1.5">
        <Input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setIdx(0); }} onKeyDown={(e) => { if (e.key === "Enter") go(e.shiftKey ? -1 : 1); if (e.key === "Escape") onClose(); }} placeholder="Buscar en la hoja" className="h-8 flex-1" />
        <span className="w-12 text-center text-[11.5px] text-muted tabular-nums">{hits.length ? `${Math.min(idx, hits.length - 1) + 1}/${hits.length}` : "0/0"}</span>
        <IconButton size="sm" label="Anterior" onClick={() => go(-1)}><ChevronDown className="size-4 rotate-180" /></IconButton>
        <IconButton size="sm" label="Siguiente" onClick={() => go(1)}><ChevronDown className="size-4" /></IconButton>
        <IconButton size="sm" label="Cerrar" onClick={onClose}><X className="size-4" /></IconButton>
      </div>
      {showRep ? (
        <div className="mt-2 flex items-center gap-1.5">
          <Input value={rep} onChange={(e) => setRep(e.target.value)} placeholder="Reemplazar por" className="h-8 flex-1" />
          <Button size="sm" disabled={!hits.length} onClick={() => { const h = hits[Math.min(idx, hits.length - 1)]; if (h) onReplace([h], q, rep); }}>Reemplazar</Button>
          <Button size="sm" variant="primary" disabled={!hits.length} onClick={() => onReplace(hits, q, rep)}>Todo</Button>
        </div>
      ) : (
        <button onClick={() => setShowRep(true)} className="mt-1.5 text-[12px] text-accent hover:underline">Reemplazar…</button>
      )}
    </div>
  );
}

/* ---------------- Diálogo de gráfico ---------------- */

function ChartDialog({
  initial,
  editing,
  ev,
  si,
  onClose,
  onSave,
  onDelete,
}: {
  initial: Omit<ChartSpec, "id">;
  editing: boolean;
  ev: Evaluator;
  si: number;
  onClose: () => void;
  onSave: (s: Omit<ChartSpec, "id">) => void;
  onDelete: () => void;
}) {
  const [spec, setSpec] = useState(initial);
  const valid = !!parseRange(spec.range) && (!spec.labels || !!parseRange(spec.labels));
  const data = useMemo(() => (valid ? chartData(spec, ev, si) : { categories: [], series: [] }), [spec, ev, si, valid]);
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={editing ? "Editar gráfico" : "Insertar gráfico"}
      description="Elige el tipo y el rango de datos. La primera fila y la primera columna se usan como nombres."
      className="w-[min(94vw,760px)]"
      footer={
        <>
          {editing && <Button variant="ghost" className="mr-auto text-red-500" icon={<Trash2 className="size-4" />} onClick={onDelete}>Eliminar</Button>}
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={!valid} onClick={() => onSave(spec)}>{editing ? "Aplicar" : "Insertar"}</Button>
        </>
      }
    >
      <div className="grid grid-cols-[230px_1fr] gap-5">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-1.5">
            {CHART_TYPES.map((t) => (
              <button
                key={t.id}
                onClick={() => setSpec({ ...spec, type: t.id })}
                className={cn("flex flex-col items-center gap-1 rounded-md border p-2 text-[11px]", spec.type === t.id ? "border-accent bg-accent-soft text-accent" : "border-border hover:bg-surface-2")}
              >
                <ChartIcon type={t.id} />
                {t.label}
              </button>
            ))}
          </div>
          <label className="text-[12.5px] font-medium">
            Título
            <Input value={spec.title} onChange={(e) => setSpec({ ...spec, title: e.target.value })} placeholder="Sin título" className="mt-1 h-8" />
          </label>
          <label className="text-[12.5px] font-medium">
            Datos
            <Input value={spec.range} onChange={(e) => setSpec({ ...spec, range: e.target.value.toUpperCase() })} placeholder="A1:C10" className={cn("mt-1 h-8 font-mono", !parseRange(spec.range) && "border-red-400")} />
          </label>
          <label className="text-[12.5px] font-medium">
            Nombres de las categorías <span className="font-normal text-muted">(opcional)</span>
            <Input value={spec.labels ?? ""} onChange={(e) => setSpec({ ...spec, labels: e.target.value.toUpperCase() || undefined })} placeholder="Ej.: A2:A10" className="mt-1 h-8 font-mono" />
          </label>
          <label className="flex items-center justify-between text-[12.5px] font-medium">
            Mostrar leyenda
            <Switch checked={spec.legend !== false} onChange={(v) => setSpec({ ...spec, legend: v })} />
          </label>
        </div>
        <div className="grid place-items-center rounded-[var(--radius)] border border-border bg-paper p-2 text-paper-text">
          <ChartSvg type={spec.type} data={data} width={460} height={300} title={spec.title} legend={spec.legend !== false} />
        </div>
      </div>
    </Dialog>
  );
}

/* ---------------- Asistente de funciones ---------------- */

function FunctionDialog({ onClose, onPick }: { onClose: () => void; onPick: (f: FnInfo) => void }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<FnInfo["cat"] | "Todas">("Todas");
  const list = FN_INFO.filter((f) => (cat === "Todas" || f.cat === cat) && (!q || (f.name + " " + f.desc).toLowerCase().includes(q.toLowerCase())));
  const cats: (FnInfo["cat"] | "Todas")[] = ["Todas", "Matemáticas", "Estadística", "Lógicas", "Texto", "Fecha y hora", "Búsqueda", "Financieras"];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Insertar función" description="Busca una función y elígela para empezar a escribirla en la celda." className="w-[min(94vw,640px)]">
      <div className="mb-3 flex gap-2">
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar: suma, fecha, buscar…" className="h-9 flex-1" />
      </div>
      <div className="mb-3 flex flex-wrap gap-1">
        {cats.map((c) => (
          <button key={c} onClick={() => setCat(c)} className={cn("rounded-full px-2.5 py-1 text-[12px]", cat === c ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted hover:text-text")}>{c}</button>
        ))}
      </div>
      <div className="max-h-[340px] overflow-y-auto rounded-[var(--radius)] border border-border">
        {list.map((f) => (
          <button key={f.name} onClick={() => onPick(f)} className="flex w-full flex-col items-start border-b border-border px-3 py-2 text-left last:border-0 hover:bg-surface-2">
            <span className="font-mono text-[12.5px] font-semibold">{f.syntax}</span>
            <span className="text-[12px] text-muted">{f.desc}</span>
          </button>
        ))}
        {!list.length && <div className="px-3 py-6 text-center text-[13px] text-muted">No hay funciones con ese nombre.</div>}
      </div>
    </Dialog>
  );
}

/* ---------------- IA ---------------- */

function SheetAIDialog({
  mode,
  wb,
  ev,
  sel,
  active,
  onClose,
  onFormula,
  onTable,
}: {
  mode: "formula" | "analyze" | "generate";
  wb: Workbook;
  ev: Evaluator;
  sel: Range;
  active: string;
  onClose: () => void;
  onFormula: (f: string) => void;
  onTable: (tsv: string) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const si = wb.active;
  const sheet = wb.sheets[si];
  /** Datos de la hoja como texto (para dar contexto a la IA). */
  const context = (rg: Range | null, maxRows = 60) => {
    if (!rg) return "(hoja vacía)";
    const lines: string[] = [];
    for (let r = rg.r1; r <= Math.min(rg.r2, rg.r1 + maxRows); r++) {
      const row: string[] = [];
      for (let c = rg.c1; c <= Math.min(rg.c2, rg.c1 + 15); c++) row.push(formatValue(ev.value(si, r, c), sheet.cells[key(r, c)]?.s));
      lines.push(`${r + 1}: ${row.join(" | ")}`);
    }
    return `Columnas ${addr(rg.r1, rg.c1).replace(/\d+/, "")} a ${addr(rg.r1, Math.min(rg.c2, rg.c1 + 15)).replace(/\d+/, "")}\n` + lines.join("\n");
  };

  const run = async () => {
    setBusy(true);
    setError(null);
    setOut("");
    abort.current = new AbortController();
    try {
      let system: string;
      let msg: string;
      if (mode === "formula") {
        system =
          "Eres un experto en hojas de cálculo. Responde SOLO con una fórmula de Excel en español que empiece por =, usando «;» para separar argumentos y nombres de funciones en español (SUMA, PROMEDIO, SI, BUSCARV, CONTAR.SI…). Nada más: sin explicaciones ni comillas.";
        const used = usedRange(sheet);
        msg = `Datos de la hoja (fila: valores por columna):\n${context(used, 25)}\n\nLa fórmula irá en la celda ${active}.\nQuiero calcular: ${prompt}`;
      } else if (mode === "analyze") {
        system = "Eres un analista de datos. Responde en español, en Markdown breve: un resumen, 3-5 observaciones con cifras concretas y, si procede, una recomendación.";
        const rg = sel.r1 === sel.r2 && sel.c1 === sel.c2 ? usedRange(sheet) : sel;
        msg = `Analiza estos datos:\n${context(rg, 80)}${prompt ? `\n\nFíjate especialmente en: ${prompt}` : ""}`;
      } else {
        system =
          "Generas tablas de datos para una hoja de cálculo. Responde SOLO con la tabla en texto separado por tabuladores (TSV): la primera línea son los encabezados y no añadas nada más. Usa coma decimal y no pongas símbolos de moneda.";
        msg = `Crea una tabla con: ${prompt}`;
      }
      const text = await streamText({
        system,
        messages: [{ role: "user", content: msg }],
        signal: abort.current.signal,
        temperature: mode === "analyze" ? 0.4 : 0.2,
        onText: (_d, full) => setOut(full),
      });
      setOut(text);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const formula = mode === "formula" ? (/=[^\n`]+/.exec(out.replace(/^```\w*\n?/, ""))?.[0] ?? "").trim() : "";
  const tsv = mode === "generate"
    ? out
        .split("\n")
        .map((l) => l.replace(/^\|/, "").replace(/\|$/, "").trim())
        .filter((l) => l && !/^[-:| ]+$/.test(l))
        .map((l) => (l.includes("\t") ? l : l.split(/\s*\|\s*/).join("\t")))
        .join("\n")
    : "";

  const titles = { formula: "Fórmula con IA", analyze: "Analizar datos con IA", generate: "Generar una tabla con IA" };
  const placeholders = {
    formula: "Ej.: la suma de la columna D cuando la categoría sea «Comida»",
    analyze: "Opcional: ¿en qué quieres que se fije? (tendencias, gastos más altos…)",
    generate: "Ej.: 10 países europeos con su capital, población y superficie",
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={titles[mode]}
      description={mode === "formula" ? `La fórmula se escribirá en ${active}.` : mode === "generate" ? `La tabla se insertará a partir de ${active}.` : "Se analizan los datos seleccionados (o toda la hoja)."}
      className="w-[min(94vw,600px)]"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
          {mode === "formula" && formula && !busy && <Button variant="primary" onClick={() => onFormula(formula)}>Insertar fórmula</Button>}
          {mode === "generate" && tsv && !busy && <Button variant="primary" onClick={() => onTable(tsv)}>Insertar tabla</Button>}
          <Button variant={out ? "outline" : "primary"} icon={busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} disabled={busy || (mode !== "analyze" && !prompt.trim())} onClick={() => void run()}>
            {out ? "Otra vez" : mode === "analyze" ? "Analizar" : "Generar"}
          </Button>
        </>
      }
    >
      <textarea
        autoFocus
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter" && !e.shiftKey && !busy && (mode === "analyze" || prompt.trim())) {
            e.preventDefault();
            void run();
          }
        }}
        placeholder={placeholders[mode]}
        rows={2}
        className="w-full resize-none rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-[13.5px] outline-none focus:border-accent"
      />
      {error && <div className="mt-3 rounded-md bg-red-500/10 p-2.5 text-[12.5px] text-red-600">{error}</div>}
      {(out || busy) && (
        <div className="mt-3 max-h-[300px] overflow-auto rounded-[var(--radius)] border border-border bg-surface-2 p-3 text-[13px] whitespace-pre-wrap">
          {mode === "formula" && formula ? <code className="font-mono text-[14px] font-semibold">{formula}</code> : out || "Pensando…"}
        </div>
      )}
    </Dialog>
  );
}
