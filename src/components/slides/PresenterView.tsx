import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronLeft, ChevronRight, Minus, MonitorUp, Pause, Play, Plus, RotateCcw, X } from "lucide-react";
import { db } from "@/lib/db";
import { SLIDE_H, SLIDE_W, animTimeline, type Deck } from "@/lib/slides/model";
import { isDesktop } from "@/lib/files";
import { SlideView } from "@/components/slides/SlideView";
import { Button, cn } from "@/components/ui";

/*
 * Vista del moderador: en tu pantalla, la diapositiva actual, la siguiente,
 * las notas y el tiempo; en el proyector (otra ventana), solo la diapositiva.
 * Las dos ventanas se hablan con un BroadcastChannel.
 */

export interface ShowPos {
  i: number;
  step: number;
}

type Msg = { type: "pos"; pos: ShowPos; black: boolean } | { type: "ready" } | { type: "next" } | { type: "prev" } | { type: "end" };

const channelName = (id: string) => `lumen-show-${id}`;
const AUDIENCE = "audience";

export function stepForward(deck: Deck, p: ShowPos): ShowPos {
  const steps = animTimeline(deck.slides[p.i]).steps;
  if (p.step < steps) return { i: p.i, step: p.step + 1 };
  return p.i < deck.slides.length - 1 ? { i: p.i + 1, step: 0 } : p;
}

export function stepBack(deck: Deck, p: ShowPos): ShowPos {
  if (p.step > 0) return { i: p.i, step: p.step - 1 };
  if (p.i === 0) return p;
  return { i: p.i - 1, step: animTimeline(deck.slides[p.i - 1]).steps };
}

/** Abre la ventana del público, a pantalla completa en el segundo monitor si lo hay. Devuelve si hay otra pantalla. */
export async function openAudience(docId: string, force = false): Promise<boolean> {
  const hash = `#audience=${encodeURIComponent(docId)}`;
  if (!isDesktop()) {
    window.open(`${location.pathname}${hash}`, "lumen-audience", "popup,width=960,height=540");
    return true;
  }
  const { availableMonitors, currentMonitor } = await import("@tauri-apps/api/window");
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  const [all, here] = await Promise.all([availableMonitors(), currentMonitor()]);
  const other = all.find((m) => !here || m.position.x !== here.position.x || m.position.y !== here.position.y);
  if (!other && !force) return false;
  const old = await WebviewWindow.getByLabel(AUDIENCE);
  await old?.destroy().catch(() => {});
  const m = other ?? here;
  const k = m?.scaleFactor ?? 1;
  new WebviewWindow(AUDIENCE, {
    url: `index.html${hash}`,
    title: "Lumen Office · Presentación",
    x: m ? m.position.x / k + 40 : undefined,
    y: m ? m.position.y / k + 40 : undefined,
    width: 960,
    height: 540,
    fullscreen: !!other,
    decorations: !other,
    focus: false,
  });
  return !!other;
}

/* ------------------------------------------------------------------ */
/*  Tu pantalla                                                        */
/* ------------------------------------------------------------------ */

export function PresenterConsole({ deck, docId, start, onExit }: { deck: Deck; docId: string; start: number; onExit: (i: number) => void }) {
  const [pos, setPos] = useState<ShowPos>({ i: start, step: 0 });
  const [black, setBlack] = useState(false);
  const [noteSize, setNoteSize] = useState(20);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const [twoScreens, setTwoScreens] = useState<boolean | null>(null);
  const deckRef = useRef(deck);
  deckRef.current = deck;
  const state = useRef({ pos, black });
  state.current = { pos, black };
  const chan = useRef<BroadcastChannel | null>(null);

  const next = () => setPos((p) => stepForward(deckRef.current, p));
  const prev = () => setPos((p) => stepBack(deckRef.current, p));
  const exit = () => onExit(state.current.pos.i);

  // Canal con la ventana del público
  useEffect(() => {
    const ch = new BroadcastChannel(channelName(docId));
    chan.current = ch;
    ch.onmessage = (e: MessageEvent<Msg>) => {
      if (e.data.type === "ready") ch.postMessage({ type: "pos", ...state.current } satisfies Msg);
      else if (e.data.type === "next") next();
      else if (e.data.type === "prev") prev();
    };
    void openAudience(docId).then(setTwoScreens).catch(() => setTwoScreens(false));
    return () => {
      ch.postMessage({ type: "end" } satisfies Msg);
      ch.close();
      if (isDesktop())
        void import("@tauri-apps/api/webviewWindow").then(async ({ WebviewWindow }) => (await WebviewWindow.getByLabel(AUDIENCE))?.destroy().catch(() => {}));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  useEffect(() => {
    chan.current?.postMessage({ type: "pos", pos, black } satisfies Msg);
  }, [pos, black]);

  // Cronómetro y reloj
  useEffect(() => {
    const t = setInterval(() => {
      setNow(new Date());
      if (running) setElapsed((s) => s + 1);
    }, 1000);
    return () => clearInterval(t);
  }, [running]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest?.("input,textarea")) return;
      e.preventDefault();
      e.stopPropagation();
      const k = e.key;
      if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(k)) next();
      else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(k)) prev();
      else if (k === "Home") setPos({ i: 0, step: 0 });
      else if (k === "End") setPos({ i: deckRef.current.slides.length - 1, step: 0 });
      else if (k.toLowerCase() === "b" || k === ".") setBlack((v) => !v);
      else if (k === "Escape") exit();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const slide = deck.slides[Math.min(pos.i, deck.slides.length - 1)];
  const steps = animTimeline(slide).steps;
  const upcoming = pos.step < steps ? { slide, step: pos.step + 1, label: "Siguiente animación" } : deck.slides[pos.i + 1] ? { slide: deck.slides[pos.i + 1], step: 0, label: "Siguiente diapositiva" } : null;
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return createPortal(
    <div className="fixed inset-0 z-[200] flex flex-col bg-[#101114] text-white select-none">
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-white/10 px-4 text-[13px]">
        <span className="font-semibold">Vista del moderador</span>
        <span className="text-white/50">
          Diapositiva {pos.i + 1} de {deck.slides.length}
          {steps > 0 && ` · animación ${pos.step} de ${steps}`}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {twoScreens === false && (
            <button className="flex items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1 hover:bg-white/20" onClick={() => void openAudience(docId, true)} title="Solo hay una pantalla: abre la del público en una ventana">
              <MonitorUp className="size-4" /> Ventana del público
            </button>
          )}
          <button className={cn("rounded-md px-2.5 py-1 hover:bg-white/20", black ? "bg-white text-black" : "bg-white/10")} onClick={() => setBlack((v) => !v)} title="Pantalla en negro (B)">
            Pantalla en negro
          </button>
          <Button size="sm" variant="danger" icon={<X />} onClick={exit}>Terminar</Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.6fr)_minmax(280px,1fr)] gap-4 p-4">
        <div className="flex min-h-0 flex-col gap-3">
          <Fit>{(w) => <SlideView slide={slide} themeId={deck.theme} scale={w / SLIDE_W} step={pos.step} className={cn("rounded-md shadow-2xl", black && "opacity-30")} />}</Fit>
          <div className="flex items-center justify-center gap-3">
            <button className="grid size-11 place-items-center rounded-full bg-white/10 hover:bg-white/20" onClick={prev} title="Anterior">
              <ChevronLeft className="size-6" />
            </button>
            <div className="min-w-[160px] text-center">
              <div className="text-[38px] leading-none font-semibold tabular-nums">{mm}:{ss}</div>
              <div className="mt-1 text-[12px] text-white/50">{now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</div>
            </div>
            <button className="grid size-11 place-items-center rounded-full bg-accent hover:brightness-110" onClick={next} title="Siguiente">
              <ChevronRight className="size-6" />
            </button>
            <button className="ml-4 grid size-9 place-items-center rounded-full bg-white/10 hover:bg-white/20" onClick={() => setRunning((r) => !r)} title={running ? "Pausar el cronómetro" : "Seguir"}>
              {running ? <Pause className="size-4" /> : <Play className="size-4" />}
            </button>
            <button className="grid size-9 place-items-center rounded-full bg-white/10 hover:bg-white/20" onClick={() => setElapsed(0)} title="Poner el cronómetro a cero">
              <RotateCcw className="size-4" />
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-col gap-3">
          <div className="text-[12px] tracking-wide text-white/50 uppercase">{upcoming?.label ?? "Fin de la presentación"}</div>
          <div className="shrink-0">
            {upcoming ? (
              <Fit max={0.42}>{(w) => <SlideView slide={upcoming.slide} themeId={deck.theme} scale={w / SLIDE_W} step={upcoming.step === 0 ? 0 : upcoming.step} className="rounded-md opacity-90" />}</Fit>
            ) : (
              <div className="grid aspect-video place-items-center rounded-md border border-white/10 text-white/40">Última diapositiva</div>
            )}
          </div>
          <div className="flex items-center gap-2 text-[12px] tracking-wide text-white/50 uppercase">
            Notas
            <button className="ml-auto rounded p-1 hover:bg-white/10" onClick={() => setNoteSize((s) => Math.max(12, s - 2))} title="Letra más pequeña"><Minus className="size-3.5" /></button>
            <button className="rounded p-1 hover:bg-white/10" onClick={() => setNoteSize((s) => Math.min(40, s + 2))} title="Letra más grande"><Plus className="size-3.5" /></button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto rounded-md bg-white/5 p-4 leading-relaxed whitespace-pre-wrap select-text" style={{ fontSize: noteSize }}>
            {slide.notes || <span className="text-white/35">Esta diapositiva no tiene notas.</span>}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Ocupa el ancho disponible manteniendo 16:9 (y, si se indica, como mucho esa fracción del alto de la ventana). */
function Fit({ children, max = 0.72 }: { children: (w: number) => React.ReactNode; max?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current!;
    const update = () => setW(Math.min(el.clientWidth, (window.innerHeight * max * SLIDE_W) / SLIDE_H));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [max]);
  return (
    <div ref={ref} className="flex w-full justify-center">
      {w > 0 && children(w)}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Ventana del público                                                */
/* ------------------------------------------------------------------ */

export function AudienceWindow({ docId }: { docId: string }) {
  const doc = useLiveQuery(() => db.docs.get(docId), [docId]);
  const [pos, setPos] = useState<ShowPos>({ i: 0, step: 0 });
  const [black, setBlack] = useState(false);
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const chan = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    document.title = "Lumen Office · Presentación";
    const ch = new BroadcastChannel(channelName(docId));
    chan.current = ch;
    ch.onmessage = (e: MessageEvent<Msg>) => {
      if (e.data.type === "pos") {
        setPos(e.data.pos);
        setBlack(e.data.black);
      } else if (e.data.type === "end") close();
    };
    ch.postMessage({ type: "ready" } satisfies Msg);
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    // Las teclas y los clics en el proyector también pasan las diapositivas
    const onKey = (e: KeyboardEvent) => {
      if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(e.key)) ch.postMessage({ type: "next" } satisfies Msg);
      else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(e.key)) ch.postMessage({ type: "prev" } satisfies Msg);
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKey);
    return () => {
      ch.close();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
    };
  }, [docId]);

  const deck = doc?.data as Deck | undefined;
  const slide = deck?.slides[Math.min(pos.i, deck.slides.length - 1)];
  const scale = Math.min(size.w / SLIDE_W, size.h / SLIDE_H);
  return (
    <div
      className="fixed inset-0 grid cursor-pointer place-items-center bg-black"
      onClick={() => chan.current?.postMessage({ type: "next" } satisfies Msg)}
      onContextMenu={(e) => {
        e.preventDefault();
        chan.current?.postMessage({ type: "prev" } satisfies Msg);
      }}
    >
      {deck && slide && !black && (
        <div key={slide.id} className={slide.transition && slide.transition !== "none" ? `slide-tr-${slide.transition}` : undefined}>
          <SlideView slide={slide} themeId={deck.theme} scale={scale} step={pos.step} />
        </div>
      )}
    </div>
  );
}

function close() {
  if (isDesktop()) void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => getCurrentWindow().destroy().catch(() => window.close()));
  else window.close();
}
