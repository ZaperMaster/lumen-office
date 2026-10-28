import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLiveQuery } from "dexie-react-hooks";
import DOMPurify from "dompurify";
import {
  AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowUp, Bold, ChevronDown, Circle, Copy, Diamond, FileText, Image as ImageIcon,
  Italic, List, ListOrdered, Loader2, Minus, MoveRight, Palette, Play, Plus, Presentation, Printer, Redo2, Square, Star, StickyNote,
  Sparkles, Trash2, Triangle, Type, Underline, Undo2, X, AlignVerticalJustifyCenter, AlignHorizontalJustifyCenter, MonitorPlay, PaintBucket,
} from "lucide-react";
import { db, type DocRecord, type FileFormat } from "@/lib/db";
import {
  LAYOUTS, SLIDE_H, SLIDE_W, THEMES, deckText, esc, htmlText, newDeck, newSlide, sid, theme as getTheme,
  type Anim, type Deck, type LayoutId, type ShapeKind, type Slide, type SlideEl, type Transition,
} from "@/lib/slides/model";
import { makeSlide } from "@/lib/slides/templates";
import { streamText } from "@/lib/ai";
import { isDesktop, openFileFromDisk } from "@/lib/files";
import { openDoc } from "@/lib/actions";
import { useApp } from "@/store/app";
import { ElementView, SlideBackground, SlideView, elBoxStyle, textStyle } from "@/components/slides/SlideView";
import { OfficeFileMenu, OfficeHeader, RBig, RGroup, RibbonTabs } from "@/components/office/OfficeChrome";
import { useOfficeDoc } from "@/components/office/useOfficeDoc";
import { ColorButton, FontPicker, FontSizePicker } from "@/components/editor/controls";
import { Button, Dialog, IconButton, Input, Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, Tooltip, cn } from "@/components/ui";

/* ------------------------------------------------------------------ */
/*  Carga                                                              */
/* ------------------------------------------------------------------ */

export default function SlidesApp({ id }: { id: string }) {
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
          <p className="mb-3 text-muted">Esta presentación no existe o está en la papelera.</p>
          <Button variant="primary" onClick={() => navigate({ name: "home" })}>Volver al inicio</Button>
        </div>
      </div>
    );
  }
  return <SlidesEditor doc={doc} />;
}

function initialDeck(data: unknown): Deck {
  const d = data as Deck | undefined;
  return d?.slides?.length ? d : newDeck();
}

async function buildFile(format: FileFormat, deck: Deck, title: string): Promise<Uint8Array> {
  const { buildPptx } = await import("@/lib/slides/pptx");
  void format;
  return buildPptx(deck, title);
}

/** Solo el HTML que entiende una diapositiva (y que se puede pasar a PowerPoint). */
function cleanHtml(html: string): string {
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: ["p", "div", "br", "ul", "ol", "li", "b", "strong", "i", "em", "u", "span", "font"], ALLOWED_ATTR: ["style", "color"] });
}

type Tab = "home" | "insert" | "design" | "transitions" | "show" | "ai";
type DragState = { kind: "move" | "resize" | "rotate"; handle?: string; ids: string[]; start: { x: number; y: number }; orig: Record<string, SlideEl> };

const SHAPES: { id: ShapeKind; label: string; icon: ReactNode }[] = [
  { id: "rect", label: "Rectángulo", icon: <Square /> },
  { id: "roundRect", label: "Rectángulo redondeado", icon: <Square className="rounded" /> },
  { id: "ellipse", label: "Elipse", icon: <Circle /> },
  { id: "triangle", label: "Triángulo", icon: <Triangle /> },
  { id: "diamond", label: "Rombo", icon: <Diamond /> },
  { id: "arrow", label: "Flecha", icon: <MoveRight /> },
  { id: "star", label: "Estrella", icon: <Star /> },
  { id: "line", label: "Línea", icon: <Minus /> },
];

const TRANSITIONS: { id: Transition; label: string }[] = [
  { id: "none", label: "Ninguna" },
  { id: "fade", label: "Desvanecer" },
  { id: "slide", label: "Deslizar" },
  { id: "zoom", label: "Zoom" },
];
const ANIMS: { id: Anim; label: string }[] = [
  { id: "none", label: "Ninguna" },
  { id: "fade", label: "Aparecer" },
  { id: "fly", label: "Desde abajo" },
  { id: "zoom", label: "Zoom" },
];

/* ------------------------------------------------------------------ */
/*  Editor                                                             */
/* ------------------------------------------------------------------ */

function SlidesEditor({ doc }: { doc: DocRecord }) {
  const toast = useApp((s) => s.toast);
  const navigate = useApp((s) => s.navigate);
  const [deck, setDeck] = useState<Deck>(() => initialDeck(doc.data));
  const deckRef = useRef(deck);
  deckRef.current = deck;
  const undoStack = useRef<Deck[]>([]);
  const redoStack = useRef<Deck[]>([]);
  const [title, setTitle] = useState(doc.title);
  const [tab, setTab] = useState<Tab>("home");
  const [cur, setCur] = useState(0);
  const [sel, setSel] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [presenting, setPresenting] = useState<number | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [printing, setPrinting] = useState(false);
  const clip = useRef<SlideEl[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const stageWrap = useRef<HTMLDivElement>(null);

  const slide = deck.slides[Math.min(cur, deck.slides.length - 1)];
  const t = getTheme(deck.theme);
  const selected = slide.els.filter((e) => sel.includes(e.id));
  const one = selected.length === 1 ? selected[0] : null;

  const { saveState, files, diskState, unsavedFile } = useOfficeDoc({
    doc,
    data: deck,
    title,
    text: (d) => deckText(d),
    build: (f, d, ttl) => buildFile(f, d, ttl),
    order: ["pptx"],
  });

  /* ---------------- Cambios con deshacer ---------------- */
  const commit = useCallback((fn: (d: Deck) => Deck, history = true) => {
    const prev = deckRef.current;
    const next = fn(prev);
    if (next === prev) return;
    if (history) {
      undoStack.current.push(prev);
      if (undoStack.current.length > 150) undoStack.current.shift();
      redoStack.current = [];
    }
    deckRef.current = next;
    setDeck(next);
  }, []);
  const undo = () => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    redoStack.current.push(deckRef.current);
    deckRef.current = prev;
    setDeck(prev);
    setSel([]);
  };
  const redo = () => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(deckRef.current);
    deckRef.current = next;
    setDeck(next);
    setSel([]);
  };

  const editSlide = useCallback(
    (fn: (s: Slide) => Slide, history = true) =>
      commit((d) => {
        const i = Math.min(cur, d.slides.length - 1);
        const slides = [...d.slides];
        slides[i] = fn(slides[i]);
        return { ...d, slides };
      }, history),
    [commit, cur],
  );
  const editEls = useCallback(
    (ids: string[], patch: Partial<SlideEl> | ((e: SlideEl) => SlideEl), history = true) =>
      editSlide((s) => ({ ...s, els: s.els.map((e) => (ids.includes(e.id) ? (typeof patch === "function" ? patch(e) : { ...e, ...patch }) : e)) }), history),
    [editSlide],
  );

  /* ---------------- Diapositivas ---------------- */
  const goTo = (i: number) => {
    finishEditing();
    setCur(Math.max(0, Math.min(deckRef.current.slides.length - 1, i)));
    setSel([]);
  };
  const addSlide = (layout: LayoutId) => {
    finishEditing();
    commit((d) => {
      const slides = [...d.slides];
      slides.splice(cur + 1, 0, newSlide(layout));
      return { ...d, slides };
    });
    setCur(cur + 1);
    setSel([]);
  };
  const duplicateSlide = (i = cur) => {
    commit((d) => {
      const slides = [...d.slides];
      const copy = structuredClone(d.slides[i]);
      copy.id = sid();
      copy.els = copy.els.map((e) => ({ ...e, id: sid() }));
      slides.splice(i + 1, 0, copy);
      return { ...d, slides };
    });
    setCur(i + 1);
  };
  const deleteSlide = (i = cur) => {
    if (deckRef.current.slides.length <= 1) return toast("La presentación necesita al menos una diapositiva");
    commit((d) => ({ ...d, slides: d.slides.filter((_, j) => j !== i) }));
    setCur(Math.max(0, Math.min(i, deckRef.current.slides.length - 2)));
    setSel([]);
  };
  const moveSlide = (from: number, to: number) => {
    if (to < 0 || to >= deck.slides.length || from === to) return;
    commit((d) => {
      const slides = [...d.slides];
      const [s] = slides.splice(from, 1);
      slides.splice(to, 0, s);
      return { ...d, slides };
    });
    setCur(to);
  };

  /* ---------------- Elementos ---------------- */
  const addEl = (el: Omit<SlideEl, "id">) => {
    finishEditing();
    const full = { ...el, id: sid() } as SlideEl;
    editSlide((s) => ({ ...s, els: [...s.els, full] }));
    setSel([full.id]);
    return full;
  };
  const addText = () => {
    const el = addEl({ type: "text", x: 340, y: 300, w: 600, h: 100, html: "<p>Escribe aquí</p>", fontSize: 32, align: "left", valign: "top" });
    setTimeout(() => setEditing(el.id), 0);
  };
  const addShape = (shape: ShapeKind) =>
    addEl({ type: "shape", shape, x: 490, y: 235, w: shape === "line" ? 400 : 300, h: shape === "line" ? 20 : 250, html: "", align: "center", valign: "middle", fontSize: 26, strokeW: shape === "line" ? 4 : 0 });
  const addImage = (file: File) => {
    if (!file.type.startsWith("image/")) return toast("Ese archivo no es una imagen", "error");
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result);
      const img = new Image();
      img.onload = () => {
        // Cabe en la diapositiva conservando la proporción
        const k = Math.min(1, 900 / img.width, 560 / img.height);
        const w = Math.round(img.width * k);
        const h = Math.round(img.height * k);
        // Si hay un marcador de imagen seleccionado o en la diapositiva, se usa su sitio
        const ph = slide.els.find((e) => sel.includes(e.id) && e.placeholder?.includes("imagen")) ?? slide.els.find((e) => e.placeholder?.includes("imagen") && !htmlText(e.html));
        if (ph) {
          const kk = Math.min(ph.w / img.width, ph.h / img.height);
          const ww = Math.round(img.width * kk);
          const hh = Math.round(img.height * kk);
          editSlide((s) => ({
            ...s,
            els: s.els.map((e) => (e.id === ph.id ? { id: e.id, type: "image", src, x: ph.x + (ph.w - ww) / 2, y: ph.y + (ph.h - hh) / 2, w: ww, h: hh } : e)),
          }));
          setSel([ph.id]);
        } else addEl({ type: "image", src, x: (SLIDE_W - w) / 2, y: (SLIDE_H - h) / 2, w, h });
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  };
  const deleteSel = () => {
    if (!sel.length) return;
    editSlide((s) => ({ ...s, els: s.els.filter((e) => !sel.includes(e.id)) }));
    setSel([]);
  };
  const duplicateSel = () => {
    if (!selected.length) return;
    const copies = selected.map((e) => ({ ...structuredClone(e), id: sid(), x: e.x + 24, y: e.y + 24 }));
    editSlide((s) => ({ ...s, els: [...s.els, ...copies] }));
    setSel(copies.map((c) => c.id));
  };
  const order = (dir: "front" | "back" | "up" | "down") => {
    if (!sel.length) return;
    editSlide((s) => {
      const els = [...s.els];
      const pick = els.filter((e) => sel.includes(e.id));
      const rest = els.filter((e) => !sel.includes(e.id));
      if (dir === "front") return { ...s, els: [...rest, ...pick] };
      if (dir === "back") return { ...s, els: [...pick, ...rest] };
      const i = els.findIndex((e) => e.id === sel[0]);
      const j = dir === "up" ? Math.min(els.length - 1, i + 1) : Math.max(0, i - 1);
      [els[i], els[j]] = [els[j], els[i]];
      return { ...s, els };
    });
  };
  const alignSel = (how: "hcenter" | "vcenter") => editEls(sel, (e) => (how === "hcenter" ? { ...e, x: Math.round((SLIDE_W - e.w) / 2) } : { ...e, y: Math.round((SLIDE_H - e.h) / 2) }));

  /* ---------------- Edición de texto ---------------- */
  const editorEl = useRef<HTMLDivElement | null>(null);
  const finishEditing = useCallback(() => {
    const id = editingRef.current;
    if (!id) return;
    const node = editorEl.current;
    if (node) {
      const html = cleanHtml(node.innerHTML);
      const el = deckRef.current.slides[Math.min(cur, deckRef.current.slides.length - 1)].els.find((e) => e.id === id);
      if (el && html !== el.html) editEls([id], { html });
    }
    editingRef.current = null;
    setEditing(null);
  }, [cur, editEls]);
  const editingRef = useRef<string | null>(null);
  editingRef.current = editing;

  // Al empezar a editar, el cursor va al final del texto
  useEffect(() => {
    if (!editing) return;
    const node = editorEl.current;
    if (!node) return;
    node.focus();
    const range = document.createRange();
    range.selectNodeContents(node);
    range.collapse(false);
    const s = window.getSelection();
    s?.removeAllRanges();
    s?.addRange(range);
  }, [editing]);

  /** Formato: si se está escribiendo, al texto seleccionado; si no, a todo el elemento. */
  const exec = (cmd: string, value?: string) => {
    if (editing) {
      document.execCommand("styleWithCSS", false, "true");
      document.execCommand(cmd, false, value);
      return true;
    }
    return false;
  };
  const toggleBold = () => {
    if (!exec("bold") && sel.length) editEls(sel, (e) => ({ ...e, bold: !e.bold }));
  };
  const wrapAll = (tag: "i" | "u") => {
    if (exec(tag === "i" ? "italic" : "underline")) return;
    if (!sel.length) return;
    editEls(sel, (e) => {
      const html = e.html ?? "";
      const has = new RegExp(`^<${tag}>[\\s\\S]*</${tag}>$`).test(html);
      return { ...e, html: has ? html.slice(3, -4) : `<${tag}>${html}</${tag}>` };
    });
  };
  const list = (ordered: boolean) => {
    if (exec(ordered ? "insertOrderedList" : "insertUnorderedList")) return;
    editEls(sel, (e) => {
      const lines = htmlText(e.html).split("\n").filter(Boolean);
      const tag = ordered ? "ol" : "ul";
      const isList = new RegExp(`^<${tag}>`).test(e.html ?? "");
      return { ...e, html: isList ? lines.map((l) => `<p>${esc(l)}</p>`).join("") : `<${tag}>${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</${tag}>` };
    });
  };
  const textColor = (c: string | undefined) => {
    if (c && exec("foreColor", c)) return;
    editEls(sel, { color: c });
  };

  /* ---------------- Escenario: tamaño ---------------- */
  const [scale, setScale] = useState(0.5);
  useLayoutEffect(() => {
    const el = stageWrap.current!;
    const update = () => setScale(Math.max(0.15, Math.min((el.clientWidth - 64) / SLIDE_W, (el.clientHeight - 48) / SLIDE_H)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ---------------- Escenario: ratón ---------------- */
  const [drag, setDrag] = useState<DragState | null>(null);
  const [live, setLive] = useState<Record<string, SlideEl> | null>(null);
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
  const els = slide.els.map((e) => live?.[e.id] ?? e);

  const startDrag = (e: React.MouseEvent, kind: DragState["kind"], ids: string[], handle?: string) => {
    e.stopPropagation();
    e.preventDefault();
    const orig: Record<string, SlideEl> = {};
    for (const el of slide.els) if (ids.includes(el.id)) orig[el.id] = el;
    setDrag({ kind, handle, ids, start: { x: e.clientX, y: e.clientY }, orig });
  };

  useEffect(() => {
    if (!drag) return;
    const others = slide.els.filter((e) => !drag.ids.includes(e.id));
    const move = (ev: MouseEvent) => {
      const dx = (ev.clientX - drag.start.x) / scale;
      const dy = (ev.clientY - drag.start.y) / scale;
      const next: Record<string, SlideEl> = {};
      const gv: number[] = [];
      const gh: number[] = [];
      if (drag.kind === "move") {
        // Ajuste a los centros y bordes de la diapositiva y de los demás elementos
        const box = Object.values(drag.orig);
        const minX = Math.min(...box.map((b) => b.x)) + dx;
        const minY = Math.min(...box.map((b) => b.y)) + dy;
        const maxX = Math.max(...box.map((b) => b.x + b.w)) + dx;
        const maxY = Math.max(...box.map((b) => b.y + b.h)) + dy;
        let sx = 0;
        let sy = 0;
        if (!ev.altKey) {
          const xs = [0, SLIDE_W / 2, SLIDE_W, ...others.flatMap((o) => [o.x, o.x + o.w / 2, o.x + o.w])];
          const ys = [0, SLIDE_H / 2, SLIDE_H, ...others.flatMap((o) => [o.y, o.y + o.h / 2, o.y + o.h])];
          const T = 6 / scale;
          for (const [v, target] of [[minX, xs], [(minX + maxX) / 2, xs], [maxX, xs]] as [number, number[]][]) {
            const hit = target.find((x) => Math.abs(x - v) < T);
            if (hit !== undefined && !sx) {
              sx = hit - v;
              gv.push(hit);
            }
          }
          for (const [v, target] of [[minY, ys], [(minY + maxY) / 2, ys], [maxY, ys]] as [number, number[]][]) {
            const hit = target.find((y) => Math.abs(y - v) < T);
            if (hit !== undefined && !sy) {
              sy = hit - v;
              gh.push(hit);
            }
          }
        }
        for (const o of box) next[o.id] = { ...o, x: Math.round(o.x + dx + sx), y: Math.round(o.y + dy + sy) };
      } else if (drag.kind === "resize") {
        const o = Object.values(drag.orig)[0];
        const h = drag.handle!;
        let { x, y, w, h: hh } = o;
        if (h.includes("e")) w = Math.max(20, o.w + dx);
        if (h.includes("s")) hh = Math.max(20, o.h + dy);
        if (h.includes("w")) {
          w = Math.max(20, o.w - dx);
          x = o.x + o.w - w;
        }
        if (h.includes("n")) {
          hh = Math.max(20, o.h - dy);
          y = o.y + o.h - hh;
        }
        // Las imágenes conservan la proporción al estirar por una esquina (o con Mayús)
        if ((o.type === "image" && h.length === 2) || ev.shiftKey) {
          const k = Math.max(w / o.w, hh / o.h);
          w = o.w * k;
          hh = o.h * k;
          if (h.includes("w")) x = o.x + o.w - w;
          if (h.includes("n")) y = o.y + o.h - hh;
        }
        next[o.id] = { ...o, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(hh) };
      } else {
        const o = Object.values(drag.orig)[0];
        const rect = stageWrap.current!.querySelector(".stage")!.getBoundingClientRect();
        const cx = rect.left + (o.x + o.w / 2) * scale;
        const cy = rect.top + (o.y + o.h / 2) * scale;
        let a = (Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180) / Math.PI + 90;
        if (!ev.shiftKey) {
          // Se pega a los múltiplos de 15°
          const snap = Math.round(a / 15) * 15;
          if (Math.abs(snap - a) < 4) a = snap;
        }
        a = ((Math.round(a) % 360) + 360) % 360;
        next[o.id] = { ...o, rot: a };
      }
      setLive(next);
      setGuides({ v: gv, h: gh });
    };
    const up = () => {
      setDrag(null);
      setGuides({ v: [], h: [] });
      setLive((l) => {
        if (l) {
          const changed = Object.values(l).some((n) => {
            const o = drag.orig[n.id];
            return o.x !== n.x || o.y !== n.y || o.w !== n.w || o.h !== n.h || o.rot !== n.rot;
          });
          if (changed) editEls(Object.keys(l), (e) => l[e.id] ?? e);
        }
        return null;
      });
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [drag, scale, slide.els, editEls]);

  /* ---------------- Teclado ---------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (presenting !== null || aiOpen) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === "s" && !e.shiftKey) { e.preventDefault(); finishEditing(); files.save(); return; }
      if (e.key === "F12") { e.preventDefault(); finishEditing(); files.saveAs(); return; }
      if (e.key === "F5") { e.preventDefault(); finishEditing(); setPresenting(e.shiftKey ? cur : 0); return; }
      if (mod && k === "p") { e.preventDefault(); finishEditing(); setPrinting(true); return; }
      if (mod && k === "o") {
        e.preventDefault();
        if (isDesktop()) void openFileFromDisk().then((d) => d && openDoc(d)).catch((err) => toast(err instanceof Error ? err.message : "No se pudo abrir", "error"));
        else navigate({ name: "home", section: "open" });
        return;
      }
      const target = e.target as HTMLElement;
      const typing = target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
      if (editing) {
        if (e.key === "Escape") { e.preventDefault(); finishEditing(); }
        return;
      }
      if (typing) return;
      if (mod && k === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && k === "y") { e.preventDefault(); redo(); return; }
      if (mod && k === "a") { e.preventDefault(); setSel(slide.els.map((x) => x.id)); return; }
      if (mod && k === "d") { e.preventDefault(); duplicateSel(); return; }
      if (mod && k === "c" && selected.length) { e.preventDefault(); clip.current = structuredClone(selected); return; }
      if (mod && k === "x" && selected.length) { e.preventDefault(); clip.current = structuredClone(selected); deleteSel(); return; }
      if (mod && k === "v" && clip.current?.length) {
        e.preventDefault();
        const copies = clip.current.map((c) => ({ ...structuredClone(c), id: sid(), x: c.x + 20, y: c.y + 20 }));
        clip.current = copies;
        editSlide((s) => ({ ...s, els: [...s.els, ...copies] }));
        setSel(copies.map((c) => c.id));
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && sel.length) { e.preventDefault(); deleteSel(); return; }
      if (e.key === "Escape") { setSel([]); return; }
      if (e.key.startsWith("Arrow") && sel.length) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const [dx, dy] = e.key === "ArrowLeft" ? [-step, 0] : e.key === "ArrowRight" ? [step, 0] : e.key === "ArrowUp" ? [0, -step] : [0, step];
        editEls(sel, (x) => ({ ...x, x: x.x + dx, y: x.y + dy }));
        return;
      }
      if (!sel.length && (e.key === "PageDown" || e.key === "ArrowDown" || e.key === "ArrowRight")) { e.preventDefault(); goTo(cur + 1); return; }
      if (!sel.length && (e.key === "PageUp" || e.key === "ArrowUp" || e.key === "ArrowLeft")) { e.preventDefault(); goTo(cur - 1); return; }
      // Escribir con un elemento de texto seleccionado empieza a editarlo
      if (one && (one.type === "text" || one.type === "shape") && (e.key === "Enter" || e.key === "F2")) {
        e.preventDefault();
        setEditing(one.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Pegar una imagen del portapapeles
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (editing || presenting !== null) return;
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
      if (file) {
        e.preventDefault();
        addImage(file);
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  });

  /* ---------------- Imprimir ---------------- */
  useEffect(() => {
    if (!printing) return;
    let el = document.getElementById("lumen-page-size") as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement("style");
      el.id = "lumen-page-size";
      document.head.appendChild(el);
    }
    el.textContent = "@page { size: 1280px 720px; margin: 0; }";
    // Se quita la copia para imprimir cuando termina la impresión
    const done = () => setPrinting(false);
    window.addEventListener("afterprint", done, { once: true });
    const t2 = setTimeout(() => window.print(), 150);
    return () => {
      clearTimeout(t2);
      window.removeEventListener("afterprint", done);
    };
  }, [printing]);

  /* ---------------- Interfaz ---------------- */
  const tabs: { id: Tab; label: string }[] = [
    { id: "home", label: "Inicio" },
    { id: "insert", label: "Insertar" },
    { id: "design", label: "Diseño" },
    { id: "transitions", label: "Transiciones" },
    { id: "show", label: "Presentación" },
    { id: "ai", label: "IA" },
  ];
  const fontValue = one?.font ?? null;
  const sizeValue = one?.fontSize ?? 28;
  const keepFocus = (e: React.MouseEvent) => {
    // Los botones de formato no quitan el foco del texto que se está escribiendo
    if (editing) e.preventDefault();
  };

  const layoutMenu = (onPick: (l: LayoutId) => void) => (
    <MenuContent className="w-[230px]">
      <MenuLabel>Diseño de la diapositiva</MenuLabel>
      {LAYOUTS.map((l) => (
        <MenuItem key={l.id} onSelect={() => onPick(l.id)}>{l.name}</MenuItem>
      ))}
    </MenuContent>
  );

  return (
    <>
      <div className="slides-app flex h-full flex-col bg-bg">
        <OfficeHeader
          doc={doc}
          title={title}
          onTitle={setTitle}
          placeholder="Presentación sin título"
          saveState={saveState}
          diskState={diskState}
          unsavedFile={unsavedFile}
          files={files}
          icon={<Presentation />}
        >
          <Button size="sm" variant="outline" icon={<Play className="size-3.5" />} onClick={() => { finishEditing(); setPresenting(0); }}>
            Presentar
          </Button>
          <Button size="sm" variant="primary" icon={<Sparkles className="size-3.5" />} onClick={() => setAiOpen(true)}>
            IA
          </Button>
        </OfficeHeader>

        {/* Cinta */}
        <div className="no-print shrink-0 border-b border-border bg-surface" onMouseDown={keepFocus}>
          <RibbonTabs
            tabs={tabs}
            active={tab}
            onChange={setTab}
            left={
              <OfficeFileMenu
                files={files}
                saveLabel="(.pptx)"
                onPrint={() => { finishEditing(); setPrinting(true); }}
                exports={[
                  { label: "PowerPoint (.pptx)", icon: <Presentation />, onSelect: () => files.exportAs("pptx") },
                  { label: "PDF (mediante Imprimir)", icon: <Printer />, onSelect: () => { finishEditing(); setPrinting(true); } },
                ]}
              />
            }
            right={
              <>
                <IconButton size="sm" label="Deshacer" shortcut="Ctrl+Z" onClick={undo} disabled={!undoStack.current.length}><Undo2 className="size-4" /></IconButton>
                <IconButton size="sm" label="Rehacer" shortcut="Ctrl+Y" onClick={redo} disabled={!redoStack.current.length}><Redo2 className="size-4" /></IconButton>
              </>
            }
          />
          <div
            className="flex h-[92px] items-stretch overflow-x-auto overflow-y-hidden border-t border-border px-2 pt-1.5 pb-1"
            onWheel={(e) => {
              if (e.deltaY) e.currentTarget.scrollLeft += e.deltaY;
            }}
          >
            {tab === "home" && (
              <>
                <RGroup label="Diapositivas">
                  <Menu>
                    <MenuTrigger asChild>
                      <span><RBig icon={<Plus />} label="Nueva diapositiva" /></span>
                    </MenuTrigger>
                    {layoutMenu(addSlide)}
                  </Menu>
                  <div className="flex flex-col">
                    <Menu>
                      <MenuTrigger asChild>
                        <span><IconButton size="sm" label="Cambiar el diseño"><FileText className="size-4" /></IconButton></span>
                      </MenuTrigger>
                      {layoutMenu((l) => {
                        // Se conservan los textos que encajan con el nuevo diseño
                        editSlide((s) => {
                          const next = newSlide(l).els;
                          const byRole = (role: string) => s.els.filter((e) => e.role === role && htmlText(e.html));
                          for (const role of ["title", "subtitle", "body"]) {
                            const old = byRole(role);
                            next.filter((e) => e.role === role).forEach((e, i) => old[i] && (e.html = old[i].html));
                          }
                          const extra = s.els.filter((e) => !e.role);
                          return { ...s, els: [...next, ...extra] };
                        });
                        setSel([]);
                      })}
                    </Menu>
                    <IconButton size="sm" label="Duplicar diapositiva" onClick={() => duplicateSlide()}><Copy className="size-4" /></IconButton>
                  </div>
                  <IconButton size="sm" label="Eliminar diapositiva" onClick={() => deleteSlide()}><Trash2 className="size-4" /></IconButton>
                </RGroup>
                <RGroup label="Fuente" className="flex-col items-start justify-center gap-1">
                  <div className="flex items-center gap-1">
                    <FontPicker value={fontValue} onChange={(css) => editEls(sel, { font: css })} className="w-[150px]" placeholder="Fuente del tema" />
                    <FontSizePicker value={sizeValue} onChange={(pt) => editEls(sel, { fontSize: pt })} />
                  </div>
                  <div className="flex items-center gap-0.5">
                    <IconButton size="sm" label="Negrita" shortcut="Ctrl+B" active={!!one?.bold} onClick={toggleBold}><Bold className="size-4" /></IconButton>
                    <IconButton size="sm" label="Cursiva" shortcut="Ctrl+I" onClick={() => wrapAll("i")}><Italic className="size-4" /></IconButton>
                    <IconButton size="sm" label="Subrayado" shortcut="Ctrl+U" onClick={() => wrapAll("u")}><Underline className="size-4" /></IconButton>
                    <ColorButton label="Color del texto" icon={<Type />} color={one?.color ?? t.accent} onApply={(c) => textColor(c)} onClear={() => editEls(sel, { color: undefined })} />
                  </div>
                </RGroup>
                <RGroup label="Párrafo" className="flex-col items-start justify-center gap-1">
                  <div className="flex items-center gap-0.5">
                    <IconButton size="sm" label="Viñetas" onClick={() => list(false)}><List className="size-4" /></IconButton>
                    <IconButton size="sm" label="Numeración" onClick={() => list(true)}><ListOrdered className="size-4" /></IconButton>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <IconButton size="sm" label="Izquierda" active={one?.align === "left"} onClick={() => editEls(sel, { align: "left" })}><AlignLeft className="size-4" /></IconButton>
                    <IconButton size="sm" label="Centrar" active={one?.align === "center"} onClick={() => editEls(sel, { align: "center" })}><AlignCenter className="size-4" /></IconButton>
                    <IconButton size="sm" label="Derecha" active={one?.align === "right"} onClick={() => editEls(sel, { align: "right" })}><AlignRight className="size-4" /></IconButton>
                    <Menu>
                      <MenuTrigger asChild>
                        <span><IconButton size="sm" label="Alineación vertical"><AlignVerticalJustifyCenter className="size-4" /></IconButton></span>
                      </MenuTrigger>
                      <MenuContent>
                        <MenuItem onSelect={() => editEls(sel, { valign: "top" })}>Arriba</MenuItem>
                        <MenuItem onSelect={() => editEls(sel, { valign: "middle" })}>En medio</MenuItem>
                        <MenuItem onSelect={() => editEls(sel, { valign: "bottom" })}>Abajo</MenuItem>
                      </MenuContent>
                    </Menu>
                  </div>
                </RGroup>
                <RGroup label="Dibujo" className="flex-col items-start justify-center gap-1">
                  <div className="flex items-center gap-0.5">
                    <ColorButton label="Relleno de forma" icon={<PaintBucket />} color={one?.fill ?? t.accent} onApply={(c) => editEls(sel, { fill: c })} onClear={() => editEls(sel, { fill: "transparent" })} clearLabel="Sin relleno" />
                    <ColorButton label="Contorno de forma" icon={<Square />} color={one?.stroke ?? "#1c1e24"} onApply={(c) => editEls(sel, (e) => ({ ...e, stroke: c, strokeW: e.strokeW || 3 }))} onClear={() => editEls(sel, { stroke: undefined, strokeW: 0 })} clearLabel="Sin contorno" />
                  </div>
                  <div className="flex items-center gap-0.5">
                    <Menu>
                      <MenuTrigger asChild>
                        <span><IconButton size="sm" label="Organizar"><ArrowUp className="size-4" /></IconButton></span>
                      </MenuTrigger>
                      <MenuContent>
                        <MenuItem icon={<ArrowUp />} onSelect={() => order("front")}>Traer al frente</MenuItem>
                        <MenuItem icon={<ArrowUp />} onSelect={() => order("up")}>Traer adelante</MenuItem>
                        <MenuItem icon={<ArrowDown />} onSelect={() => order("down")}>Enviar atrás</MenuItem>
                        <MenuItem icon={<ArrowDown />} onSelect={() => order("back")}>Enviar al fondo</MenuItem>
                        <MenuSeparator />
                        <MenuItem icon={<AlignHorizontalJustifyCenter />} onSelect={() => alignSel("hcenter")}>Centrar en horizontal</MenuItem>
                        <MenuItem icon={<AlignVerticalJustifyCenter />} onSelect={() => alignSel("vcenter")}>Centrar en vertical</MenuItem>
                      </MenuContent>
                    </Menu>
                    <IconButton size="sm" label="Duplicar elemento" shortcut="Ctrl+D" onClick={duplicateSel} disabled={!sel.length}><Copy className="size-4" /></IconButton>
                    <IconButton size="sm" label="Eliminar elemento" shortcut="Supr" onClick={deleteSel} disabled={!sel.length}><Trash2 className="size-4" /></IconButton>
                  </div>
                </RGroup>
              </>
            )}

            {tab === "insert" && (
              <>
                <RGroup label="Diapositivas">
                  <Menu>
                    <MenuTrigger asChild>
                      <span><RBig icon={<Plus />} label="Nueva diapositiva" /></span>
                    </MenuTrigger>
                    {layoutMenu(addSlide)}
                  </Menu>
                </RGroup>
                <RGroup label="Elementos">
                  <RBig icon={<Type />} label="Cuadro de texto" onClick={addText} />
                  <RBig icon={<ImageIcon />} label="Imagen" onClick={() => fileRef.current?.click()} title="También puedes pegarla con Ctrl+V o arrastrarla" />
                </RGroup>
                <RGroup label="Formas">
                  <div className="grid grid-cols-4 gap-0.5">
                    {SHAPES.map((s) => (
                      <IconButton key={s.id} size="sm" label={s.label} onClick={() => addShape(s.id)}>
                        <span className="[&>svg]:size-4">{s.icon}</span>
                      </IconButton>
                    ))}
                  </div>
                </RGroup>
              </>
            )}

            {tab === "design" && (
              <>
                <RGroup label="Temas">
                  <div className="flex items-center gap-1.5">
                    {THEMES.map((th) => (
                      <Tooltip key={th.id} label={th.name}>
                        <button
                          onClick={() => commit((d) => ({ ...d, theme: th.id }))}
                          className={cn("relative h-[56px] w-[88px] overflow-hidden rounded-md border-2 text-left", deck.theme === th.id ? "border-accent" : "border-border hover:border-accent/50")}
                          style={{ background: th.bg }}
                        >
                          <span className="absolute top-2 left-2 text-[13px] font-bold" style={{ color: th.title, fontFamily: th.titleFont }}>Aa</span>
                          <span className="absolute bottom-2 left-2 h-1.5 w-10 rounded-full" style={{ background: th.accent }} />
                          {th.band && <span className="absolute right-0 bottom-0 left-0 h-1" style={{ background: th.band }} />}
                        </button>
                      </Tooltip>
                    ))}
                  </div>
                </RGroup>
                <RGroup label="Fondo">
                  <ColorButton label="Color de fondo de esta diapositiva" icon={<Palette />} color={slide.bg ?? t.bg} onApply={(c) => editSlide((s) => ({ ...s, bg: c }))} onClear={() => editSlide((s) => ({ ...s, bg: undefined }))} clearLabel="Fondo del tema" />
                  <RBig icon={<Palette />} label="Aplicar a todas" onClick={() => commit((d) => ({ ...d, slides: d.slides.map((s) => ({ ...s, bg: slide.bg })) }))} title="Usa el fondo de esta diapositiva en todas" />
                </RGroup>
              </>
            )}

            {tab === "transitions" && (
              <>
                <RGroup label="Transición al entrar en la diapositiva">
                  {TRANSITIONS.map((tr) => (
                    <RBig key={tr.id} icon={<MonitorPlay />} label={tr.label} active={(slide.transition ?? "none") === tr.id} onClick={() => editSlide((s) => ({ ...s, transition: tr.id }))} />
                  ))}
                  <RBig icon={<Copy />} label="Aplicar a todas" onClick={() => commit((d) => ({ ...d, slides: d.slides.map((s) => ({ ...s, transition: slide.transition })) }))} />
                </RGroup>
                <RGroup label="Animación del elemento seleccionado">
                  {ANIMS.map((a) => (
                    <RBig key={a.id} icon={<Sparkles />} label={a.label} disabled={!sel.length} active={!!one && (one.anim ?? "none") === a.id} onClick={() => editEls(sel, { anim: a.id })} />
                  ))}
                </RGroup>
              </>
            )}

            {tab === "show" && (
              <RGroup label="Iniciar presentación">
                <RBig icon={<Play />} label="Desde el principio" onClick={() => { finishEditing(); setPresenting(0); }} title="F5" />
                <RBig icon={<MonitorPlay />} label="Desde la actual" onClick={() => { finishEditing(); setPresenting(cur); }} title="Mayús+F5" />
              </RGroup>
            )}

            {tab === "ai" && (
              <RGroup label="Asistente">
                <RBig icon={<Sparkles />} label="Crear presentación" onClick={() => setAiOpen(true)} title="La IA escribe las diapositivas a partir de un tema" />
                <RBig icon={<StickyNote />} label="Notas del orador" onClick={() => void speakerNotes()} title="La IA escribe qué decir en esta diapositiva" />
              </RGroup>
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Miniaturas */}
          <aside className="no-print flex w-[200px] shrink-0 flex-col gap-2 overflow-y-auto border-r border-border bg-surface p-3">
            {deck.slides.map((s, i) => (
              <div
                key={s.id}
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/slide", String(i))}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const from = Number(e.dataTransfer.getData("text/slide"));
                  if (!Number.isNaN(from)) moveSlide(from, i);
                }}
                onClick={() => goTo(i)}
                className="group flex cursor-pointer gap-1.5"
              >
                <span className={cn("w-4 pt-1 text-right text-[11px] tabular-nums", i === cur ? "font-semibold text-accent" : "text-muted")}>{i + 1}</span>
                <div className={cn("relative overflow-hidden rounded-md border-2 transition-colors", i === cur ? "border-accent" : "border-border group-hover:border-accent/40")}>
                  <SlideView slide={s} themeId={deck.theme} scale={150 / SLIDE_W} />
                  <div className="absolute top-1 right-1 hidden gap-0.5 group-hover:flex">
                    <button onClick={(e) => { e.stopPropagation(); duplicateSlide(i); }} className="grid size-5 place-items-center rounded bg-black/60 text-white" title="Duplicar"><Copy className="size-3" /></button>
                    <button onClick={(e) => { e.stopPropagation(); deleteSlide(i); }} className="grid size-5 place-items-center rounded bg-black/60 text-white" title="Eliminar"><X className="size-3" /></button>
                  </div>
                </div>
              </div>
            ))}
            <Menu>
              <MenuTrigger asChild>
                <button className="mt-1 flex h-9 items-center justify-center gap-1.5 rounded-md border border-dashed border-border text-[12.5px] text-muted hover:border-accent hover:text-accent">
                  <Plus className="size-4" /> Nueva <ChevronDown className="size-3" />
                </button>
              </MenuTrigger>
              {layoutMenu(addSlide)}
            </Menu>
          </aside>

          {/* Escenario y notas */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div
              ref={stageWrap}
              className="relative grid min-h-0 flex-1 place-items-center overflow-hidden bg-desk"
              onMouseDown={() => {
                finishEditing();
                setSel([]);
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f) addImage(f);
              }}
            >
              <div className="stage relative shadow-lg" style={{ width: SLIDE_W * scale, height: SLIDE_H * scale }}>
                <div className="slide-canvas" style={{ width: SLIDE_W, height: SLIDE_H, transform: `scale(${scale})`, transformOrigin: "0 0" }}>
                  <SlideBackground slide={slide} t={t} />
                  {els.map((el) => {
                    const isEditing = editing === el.id;
                    return (
                      <div
                        key={el.id}
                        className="slide-el"
                        style={{ ...elBoxStyle(el), cursor: isEditing ? "text" : "move" }}
                        onMouseDown={(e) => {
                          if (isEditing) {
                            e.stopPropagation();
                            return;
                          }
                          finishEditing();
                          const ids = e.shiftKey ? (sel.includes(el.id) ? sel.filter((x) => x !== el.id) : [...sel, el.id]) : sel.includes(el.id) ? sel : [el.id];
                          setSel(ids);
                          startDrag(e, "move", ids);
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          if (el.type === "text" || el.type === "shape") {
                            setSel([el.id]);
                            setEditing(el.id);
                          } else if (el.type === "image") fileRef.current?.click();
                        }}
                      >
                        {isEditing ? (
                          <>
                            {el.type === "shape" && <ElementView el={{ ...el, html: "" }} t={t} />}
                            <div className="slide-text-box" style={textStyle(el, t)}>
                              <div
                                ref={editorEl}
                                className="slide-text"
                                contentEditable
                                suppressContentEditableWarning
                                dangerouslySetInnerHTML={{ __html: el.html || "<p><br></p>" }}
                                onKeyDown={(e) => {
                                  const mod = e.ctrlKey || e.metaKey;
                                  if (mod && e.key.toLowerCase() === "b") { e.preventDefault(); document.execCommand("bold"); }
                                }}
                              />
                            </div>
                          </>
                        ) : (
                          <ElementView el={el} t={t} showPlaceholder />
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Selección y tiradores (en píxeles de pantalla) */}
                {els
                  .filter((e) => sel.includes(e.id))
                  .map((el) => {
                    const box = { left: el.x * scale, top: el.y * scale, width: el.w * scale, height: el.h * scale };
                    const single = sel.length === 1 && !editing;
                    const handles = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
                    const pos = (h: string) => ({
                      left: h.includes("w") ? -6 : h.includes("e") ? box.width - 5 : box.width / 2 - 5,
                      top: h.includes("n") ? -6 : h.includes("s") ? box.height - 5 : box.height / 2 - 5,
                      cursor: `${h}-resize`,
                    });
                    return (
                      <div
                        key={el.id}
                        className="pointer-events-none absolute"
                        style={{ ...box, transform: el.rot ? `rotate(${el.rot}deg)` : undefined, outline: `2px solid var(--accent)`, outlineOffset: 1 }}
                      >
                        {single &&
                          handles.map((h) => (
                            <div key={h} className="stage-handle pointer-events-auto" style={pos(h)} onMouseDown={(e) => startDrag(e, "resize", [el.id], h)} />
                          ))}
                        {single && el.shape !== "line" && (
                          <div className="stage-rot pointer-events-auto" style={{ left: box.width / 2 - 6, top: -30 }} onMouseDown={(e) => startDrag(e, "rotate", [el.id])} title="Girar (Mayús: libre)" />
                        )}
                      </div>
                    );
                  })}
                {guides.v.map((x, i) => <div key={`v${i}`} className="stage-guide" style={{ left: x * scale, top: 0, width: 1, height: SLIDE_H * scale }} />)}
                {guides.h.map((y, i) => <div key={`h${i}`} className="stage-guide" style={{ top: y * scale, left: 0, height: 1, width: SLIDE_W * scale }} />)}
              </div>
              <div className="pointer-events-none absolute bottom-2 left-3 text-[11.5px] text-muted">
                Diapositiva {cur + 1} de {deck.slides.length}
                {one && ` · ${Math.round(one.x)}, ${Math.round(one.y)} · ${Math.round(one.w)} × ${Math.round(one.h)}${one.rot ? ` · ${one.rot}°` : ""}`}
              </div>
            </div>
            <textarea
              value={slide.notes ?? ""}
              onChange={(e) => editSlide((s) => ({ ...s, notes: e.target.value }), false)}
              placeholder="Notas del orador (solo las ves tú al presentar con la tecla N)"
              className="no-print h-[84px] shrink-0 resize-none border-t border-border bg-surface px-4 py-2.5 text-[13px] outline-none"
            />
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) addImage(f);
          }}
        />
      </div>

      {presenting !== null && <Presenter deck={deck} start={presenting} onExit={(i) => { setPresenting(null); setCur(i); }} />}
      {aiOpen && (
        <SlidesAIDialog
          onClose={() => setAiOpen(false)}
          onCreate={(slides, mode) => {
            if (mode === "replace") {
              commit((d) => ({ ...d, slides }));
              setCur(0);
            } else {
              commit((d) => ({ ...d, slides: [...d.slides, ...slides] }));
              setCur(deckRef.current.slides.length - slides.length);
            }
            if (!title && slides[0]) setTitle(htmlText(slides[0].els[0]?.html).slice(0, 80));
            setAiOpen(false);
            toast(`${slides.length} diapositivas creadas`, "success");
          }}
        />
      )}
      {printing &&
        createPortal(
          <div className="slides-print">
            {deck.slides.map((s) => (
              <div key={s.id} className="slide-page">
                <SlideView slide={s} themeId={deck.theme} scale={1} />
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  );

  async function speakerNotes() {
    const text = slide.els.map((e) => htmlText(e.html)).filter(Boolean).join("\n");
    if (!text) return toast("Esta diapositiva no tiene texto");
    toast("Escribiendo las notas…");
    try {
      const out = await streamText({
        system: "Eres un experto en presentaciones. Escribe en español, en 3-5 frases naturales, lo que el orador debería decir para esta diapositiva. Solo el texto, sin títulos.",
        messages: [{ role: "user", content: `Diapositiva:\n${text}` }],
        temperature: 0.5,
      });
      editSlide((s) => ({ ...s, notes: out.trim() }));
      toast("Notas del orador añadidas", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudieron escribir las notas", "error");
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Modo presentación                                                  */
/* ------------------------------------------------------------------ */

function Presenter({ deck, start, onExit }: { deck: Deck; start: number; onExit: (i: number) => void }) {
  const [i, setI] = useState(start);
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [notes, setNotes] = useState(false);
  const [black, setBlack] = useState(false);
  const iRef = useRef(i);
  iRef.current = i;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void ref.current?.requestFullscreen?.().catch(() => {});
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    const onFs = () => {
      if (!document.fullscreenElement) onExit(iRef.current);
    };
    window.addEventListener("resize", onResize);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      window.removeEventListener("resize", onResize);
      document.removeEventListener("fullscreenchange", onFs);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const k = e.key;
      if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(k)) setI((x) => Math.min(deck.slides.length - 1, x + 1));
      else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(k)) setI((x) => Math.max(0, x - 1));
      else if (k === "Home") setI(0);
      else if (k === "End") setI(deck.slides.length - 1);
      else if (k.toLowerCase() === "n") setNotes((v) => !v);
      else if (k.toLowerCase() === "b" || k === ".") setBlack((v) => !v);
      else if (k === "Escape") onExit(iRef.current);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [deck.slides.length, onExit]);

  const slide = deck.slides[i];
  const scale = Math.min(size.w / SLIDE_W, size.h / SLIDE_H);
  return createPortal(
    <div
      ref={ref}
      className="fixed inset-0 z-[200] grid cursor-pointer place-items-center bg-black"
      onClick={(e) => (e.button === 0 ? setI((x) => Math.min(deck.slides.length - 1, x + 1)) : undefined)}
      onContextMenu={(e) => {
        e.preventDefault();
        setI((x) => Math.max(0, x - 1));
      }}
    >
      {!black && (
        <div key={slide.id} className={slide.transition && slide.transition !== "none" ? `slide-tr-${slide.transition}` : undefined}>
          <SlideView slide={slide} themeId={deck.theme} scale={scale} animate />
        </div>
      )}
      <div className="absolute right-4 bottom-3 rounded-full bg-black/50 px-3 py-1 text-[12px] text-white/80">
        {i + 1} / {deck.slides.length} · Esc para salir · N notas
      </div>
      {notes && slide.notes && (
        <div className="absolute bottom-12 left-1/2 max-w-[70vw] -translate-x-1/2 rounded-lg bg-black/80 px-4 py-3 text-[15px] whitespace-pre-wrap text-white">{slide.notes}</div>
      )}
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ */
/*  Crear con IA                                                       */
/* ------------------------------------------------------------------ */

/** Lee el esquema que escribe la IA: «# título», «## diapositiva» y «- punto». */
export function parseOutline(text: string): Slide[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const slides: Slide[] = [];
  let deckTitle = "";
  let subtitle = "";
  let curTitle: string | null = null;
  let bullets: string[] = [];
  const flush = () => {
    if (curTitle !== null) slides.push(makeSlide(bullets.length ? "content" : "section", curTitle, bullets.length ? bullets : undefined));
    curTitle = null;
    bullets = [];
  };
  for (const raw of lines) {
    const l = raw.replace(/\*\*/g, "");
    if (/^#\s+/.test(l) && !deckTitle) deckTitle = l.replace(/^#\s+/, "");
    else if (/^##+\s+/.test(l) || /^diapositiva\s*\d+[:.]/i.test(l)) {
      flush();
      curTitle = l.replace(/^##+\s+/, "").replace(/^diapositiva\s*\d+[:.]\s*/i, "");
    } else if (/^([-*•]|\d+[.)])\s+/.test(l)) {
      if (curTitle === null) curTitle = deckTitle || "Introducción";
      bullets.push(l.replace(/^([-*•]|\d+[.)])\s+/, ""));
    } else if (deckTitle && curTitle === null && !subtitle) subtitle = l;
  }
  flush();
  if (deckTitle) slides.unshift(makeSlide("title", deckTitle, subtitle || undefined));
  return slides;
}

function SlidesAIDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (slides: Slide[], mode: "replace" | "append") => void }) {
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState(6);
  const [audience, setAudience] = useState("");
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  const slides = useMemo(() => (out ? parseOutline(out) : []), [out]);

  const run = async () => {
    setBusy(true);
    setError(null);
    setOut("");
    abort.current = new AbortController();
    try {
      const text = await streamText({
        system:
          "Creas presentaciones. Responde SOLO con un esquema en este formato exacto, en español:\n# Título de la presentación\nSubtítulo breve\n## Título de la diapositiva\n- punto breve\n- punto breve\n(Repite «##» para cada diapositiva; 3-5 puntos de menos de 12 palabras cada uno. Nada más.)",
        messages: [{ role: "user", content: `Tema: ${topic}\nNúmero de diapositivas de contenido: ${count}${audience ? `\nPúblico: ${audience}` : ""}` }],
        signal: abort.current.signal,
        temperature: 0.6,
        onText: (_d, full) => setOut(full),
      });
      setOut(text);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Crear presentación con IA"
      description="Describe el tema y la IA escribirá las diapositivas. Después puedes cambiar el tema visual y editarlo todo."
      className="w-[min(94vw,640px)]"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
          {slides.length > 0 && !busy && (
            <>
              <Button variant="outline" onClick={() => onCreate(slides, "append")}>Añadir al final</Button>
              <Button variant="primary" onClick={() => onCreate(slides, "replace")}>Usar estas {slides.length} diapositivas</Button>
            </>
          )}
          {(!slides.length || busy) && (
            <Button variant="primary" icon={busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} disabled={busy || !topic.trim()} onClick={() => void run()}>
              Generar
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <label className="text-[12.5px] font-medium">
          Tema
          <Input autoFocus value={topic} onChange={(e) => setTopic(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter" && topic.trim() && !busy) void run(); }} placeholder="Ej.: Energías renovables en España" className="mt-1 h-9" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-[12.5px] font-medium">
            Público <span className="font-normal text-muted">(opcional)</span>
            <Input value={audience} onChange={(e) => setAudience(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder="Ej.: alumnos de 4.º de ESO" className="mt-1 h-9" />
          </label>
          <label className="text-[12.5px] font-medium">
            Diapositivas
            <select value={count} onChange={(e) => setCount(Number(e.target.value))} className="mt-1 h-9 w-full rounded-[var(--radius)] border border-border bg-surface px-2 text-[13px]">
              {[4, 5, 6, 8, 10, 12].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>
        {error && <div className="rounded-md bg-red-500/10 p-2.5 text-[12.5px] text-red-600">{error}</div>}
        {(out || busy) && (
          <div className="max-h-[260px] overflow-auto rounded-[var(--radius)] border border-border bg-surface-2 p-3 text-[12.5px] whitespace-pre-wrap">{out || "Pensando…"}</div>
        )}
      </div>
    </Dialog>
  );
}
