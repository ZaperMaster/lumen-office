import { createElement } from "react";
import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import { renderToStaticMarkup } from "react-dom/server";
import { SlideView } from "@/components/slides/SlideView";
import { SLIDE_H, SLIDE_W, animTimeline, theme as getTheme, type Deck, type Slide } from "@/lib/slides/model";

/*
 * Exportar la presentación como vídeo. Cada diapositiva (y cada paso de sus
 * animaciones) se dibuja como imagen —el HTML de la diapositiva dentro de un
 * SVG, con sus estilos y fuentes— y se codifican los fotogramas en MP4 con
 * WebCodecs (mucho más rápido que el tiempo real), con un fundido entre
 * imágenes. Si el equipo no tiene WebCodecs, se graba en tiempo real.
 */

export interface VideoOptions {
  /** Segundos que se ve cada diapositiva */
  perSlide: number;
  /** Segundos de cada paso de animación «al hacer clic» */
  perStep: number;
  /** Alto del vídeo: 720 o 1080 */
  height: 720 | 1080;
}

export interface VideoResult {
  blob: Blob;
  ext: "mp4" | "webm";
}

const FPS = 30;
const FADE = 0.6;

/** Formato de vídeo que admite la grabación en tiempo real (MP4 si se puede). */
function pickMime(): { mime: string; ext: VideoResult["ext"] } {
  for (const mime of ["video/mp4;codecs=avc1.640028", "video/mp4;codecs=avc1", "video/mp4"]) if (MediaRecorder.isTypeSupported(mime)) return { mime, ext: "mp4" };
  for (const mime of ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]) if (MediaRecorder.isTypeSupported(mime)) return { mime, ext: "webm" };
  throw new Error("Este equipo no puede grabar vídeo.");
}

/** Texto de todas las hojas de estilo (sin las fuentes, que se incrustan aparte). */
export function pageCss(): string {
  const out: string[] = [];
  for (const sheet of [...document.styleSheets]) {
    try {
      for (const r of [...sheet.cssRules]) if (!(r instanceof CSSFontFaceRule)) out.push(r.cssText);
    } catch {
      // Hojas de otro origen: no se pueden leer
    }
  }
  return out.join("\n");
}

const fontCache = new Map<string, Promise<string>>();

/** Las fuentes usadas, incrustadas como datos (una imagen SVG no puede descargar nada). */
async function embeddedFonts(families: Set<string>): Promise<string> {
  const rules: Promise<string>[] = [];
  for (const sheet of [...document.styleSheets]) {
    let list: CSSRule[] = [];
    try {
      list = [...sheet.cssRules];
    } catch {
      continue;
    }
    for (const r of list) {
      if (!(r instanceof CSSFontFaceRule)) continue;
      const family = r.style.getPropertyValue("font-family").replace(/["']/g, "").trim();
      if (!families.has(family)) continue;
      // Solo el alfabeto latino (español incluido)
      const range = r.style.getPropertyValue("unicode-range");
      if (range && !/U\+0000|U\+0100/i.test(range)) continue;
      const url = /url\(["']?([^"')]+)["']?\)/.exec(r.style.getPropertyValue("src"))?.[1];
      if (!url) continue;
      const abs = new URL(url, sheet.href ?? location.href).href;
      if (!fontCache.has(abs)) {
        fontCache.set(
          abs,
          fetch(abs)
            .then((res) => res.blob())
            .then((b) => new Promise<string>((ok) => {
              const fr = new FileReader();
              fr.onload = () => ok(String(fr.result));
              fr.readAsDataURL(b);
            })),
        );
      }
      rules.push(fontCache.get(abs)!.then((data) => r.cssText.replace(/src:[^;]+;/, `src: url("${data}") format("woff2");`)).catch(() => ""));
    }
  }
  return (await Promise.all(rules)).join("\n");
}

/** Nombres de las fuentes de la presentación. */
function deckFamilies(deck: Deck): Set<string> {
  const t = getTheme(deck.theme);
  const out = new Set<string>();
  const add = (css?: string) => css?.split(",").forEach((f) => out.add(f.replace(/["']/g, "").trim()));
  add(t.titleFont);
  add(t.bodyFont);
  for (const s of deck.slides) for (const e of s.els) add(e.font);
  return out;
}

/** La diapositiva tal como queda tras un paso de sus animaciones (sin moverse). */
function stillOf(slide: Slide, step: number): Slide {
  const tl = animTimeline(slide);
  return { ...slide, els: slide.els.filter((e) => (tl.items.get(e.id)?.step ?? 0) <= step).map((e) => ({ ...e, anim: undefined })) };
}

export async function slideImage(slide: Slide, themeId: string, css: string, w: number, h: number): Promise<HTMLImageElement> {
  const holder = document.createElement("div");
  holder.innerHTML = renderToStaticMarkup(createElement(SlideView, { slide, themeId, scale: 1 }));
  const body = new XMLSerializer().serializeToString(holder);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${SLIDE_W} ${SLIDE_H}"><foreignObject x="0" y="0" width="${SLIDE_W}" height="${SLIDE_H}"><div xmlns="http://www.w3.org/1999/xhtml"><style><![CDATA[${css.replace(/]]>/g, "]] >")}]]></style>${body}</div></foreignObject></svg>`;
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  return img;
}

interface Frame {
  img: HTMLImageElement;
  secs: number;
  fade: boolean;
  slide: number;
}

const cancelled = () => new DOMException("Cancelado", "AbortError");

export async function exportVideo(deck: Deck, opts: VideoOptions, onProgress: (p: number, label: string) => void, signal: AbortSignal): Promise<VideoResult> {
  const h = opts.height;
  const w = Math.round((h * SLIDE_W) / SLIDE_H);
  onProgress(0, "Preparando las fuentes…");
  const css = `${pageCss()}
${await embeddedFonts(deckFamilies(deck))}`;

  // Imágenes y cuánto dura cada una
  const frames: Frame[] = [];
  for (let i = 0; i < deck.slides.length; i++) {
    if (signal.aborted) throw cancelled();
    onProgress((i / deck.slides.length) * 0.15, `Dibujando la diapositiva ${i + 1} de ${deck.slides.length}…`);
    const s = deck.slides[i];
    const steps = animTimeline(s).steps;
    for (let step = 0; step <= steps; step++) {
      frames.push({
        img: await slideImage(stillOf(s, step), deck.theme, css, w, h),
        secs: step === steps ? opts.perSlide : opts.perStep,
        slide: i,
        // Entre diapositivas, fundido si tiene transición; los pasos de animación aparecen con fundido
        fade: step > 0 || (i > 0 && (s.transition ?? "none") !== "none"),
      });
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d")!;
  /** Dibuja el instante t (segundos) de la imagen f */
  const paint = (f: number, t: number) => {
    const fr = frames[f];
    const prev = frames[f - 1];
    g.globalAlpha = 1;
    g.drawImage(prev && fr.fade && t < FADE ? prev.img : fr.img, 0, 0, w, h);
    if (prev && fr.fade && t < FADE) {
      g.globalAlpha = t / FADE;
      g.drawImage(fr.img, 0, 0, w, h);
      g.globalAlpha = 1;
    }
  };
  const report = (f: number, done: number, total: number) =>
    onProgress(0.15 + 0.85 * (done / total), `Creando el vídeo: diapositiva ${frames[f].slide + 1} de ${deck.slides.length}…`);

  const fast = await encodeMp4(frames, canvas, paint, report, signal, opts.height);
  if (fast) return { blob: fast, ext: "mp4" };
  return recordRealtime(frames, canvas, paint, report, signal, opts.height);
}

/** Codifica todos los fotogramas en MP4 (H.264) sin esperar: un vídeo de minutos se crea en segundos. */
async function encodeMp4(
  frames: Frame[],
  canvas: HTMLCanvasElement,
  paint: (f: number, t: number) => void,
  report: (f: number, done: number, total: number) => void,
  signal: AbortSignal,
  height: number,
): Promise<Blob | null> {
  if (typeof VideoEncoder === "undefined") return null;
  const { width: w, height: h } = canvas;
  const bitrate = height >= 1080 ? 8_000_000 : 5_000_000;
  let codec: string | null = null;
  for (const c of ["avc1.640028", "avc1.4d0028", "avc1.42002a"]) {
    const s = await VideoEncoder.isConfigSupported({ codec: c, width: w, height: h, bitrate, framerate: FPS }).catch(() => null);
    if (s?.supported) {
      codec = c;
      break;
    }
  }
  if (!codec) return null;
  const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: "avc", width: w, height: h, frameRate: FPS }, fastStart: "in-memory" });
  let failure: unknown = null;
  const enc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => (failure = e) });
  enc.configure({ codec, width: w, height: h, bitrate, framerate: FPS, avc: { format: "avc" } });
  const total = frames.reduce((a, f) => a + Math.round(f.secs * FPS), 0);
  let n = 0;
  try {
    for (let f = 0; f < frames.length; f++) {
      const count = Math.round(frames[f].secs * FPS);
      for (let k = 0; k < count; k++) {
        if (signal.aborted) throw cancelled();
        if (failure) throw failure;
        paint(f, k / FPS);
        const vf = new VideoFrame(canvas, { timestamp: Math.round((n * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
        // Un fotograma completo cada 2 segundos (para poder saltar en el reproductor)
        enc.encode(vf, { keyFrame: n % (FPS * 2) === 0 });
        vf.close();
        n++;
        // Sin acumular demasiados fotogramas pendientes
        while (enc.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 2));
        if (k % 10 === 0) {
          report(f, n, total);
          await new Promise((r) => setTimeout(r, 0));
        }
      }
    }
    await enc.flush();
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    console.warn("WebCodecs falló; se graba en tiempo real", e);
    return null;
  } finally {
    if (enc.state !== "closed") enc.close();
  }
  muxer.finalize();
  return new Blob([muxer.target.buffer], { type: "video/mp4" });
}

/** Plan B: se graba el lienzo en tiempo real con MediaRecorder (tarda lo que dura el vídeo). */
async function recordRealtime(
  frames: Frame[],
  canvas: HTMLCanvasElement,
  paint: (f: number, t: number) => void,
  report: (f: number, done: number, total: number) => void,
  signal: AbortSignal,
  height: number,
): Promise<VideoResult> {
  const { mime, ext } = pickMime();
  const stream = canvas.captureStream(0);
  const track = stream.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void };
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: height >= 1080 ? 10_000_000 : 6_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<void>((ok) => (rec.onstop = () => ok()));
  const total = frames.reduce((a, f) => a + f.secs, 0);
  paint(0, 0);
  rec.start(1000);
  // Con temporizador (no requestAnimationFrame) para que siga aunque la ventana no se vea
  const t0 = performance.now();
  let before = 0;
  try {
    for (let f = 0; f < frames.length; f++) {
      const start = t0 + before * 1000;
      const end = start + frames[f].secs * 1000;
      while (performance.now() < end) {
        if (signal.aborted) throw cancelled();
        const t = (performance.now() - start) / 1000;
        paint(f, t);
        track.requestFrame?.();
        report(f, before + t, total);
        await new Promise((r) => setTimeout(r, 1000 / FPS));
      }
      before += frames[f].secs;
    }
  } finally {
    rec.stop();
    track.stop();
  }
  await done;
  return { blob: new Blob(chunks, { type: mime.split(";")[0] }), ext };
}
