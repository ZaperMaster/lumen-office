import type { CSSProperties, ReactNode } from "react";
import { SLIDE_H, SLIDE_W, animTimeline, htmlText, theme as getTheme, type AnimStep, type Slide, type SlideEl, type Theme } from "@/lib/slides/model";

/* Dibujo de una diapositiva (miniaturas, editor, modo presentación e impresión). */

export function elColor(el: SlideEl, t: Theme): string {
  if (el.color) return el.color;
  if (el.role === "title") return t.title;
  // Texto blanco sobre las figuras de color; sobre las transparentes, el del tema
  const translucent = el.fill === "transparent" || (el.fill?.length ?? 0) === 9;
  return el.type === "shape" && !translucent ? "#ffffff" : t.text;
}

export function elFont(el: SlideEl, t: Theme): string {
  return el.font ?? (el.role === "title" ? t.titleFont : t.bodyFont);
}

/** Figura en SVG que ocupa todo el elemento. */
export function ShapeSvg({ el, accent }: { el: SlideEl; accent: string }) {
  const w = el.w;
  const h = el.h;
  const sw = el.strokeW ?? 0;
  const fill = el.fill ?? accent;
  const stroke = el.stroke ?? "none";
  const p = sw / 2;
  let shape: ReactNode;
  switch (el.shape) {
    case "ellipse":
      shape = <ellipse cx={w / 2} cy={h / 2} rx={Math.max(0, w / 2 - p)} ry={Math.max(0, h / 2 - p)} />;
      break;
    case "roundRect":
      shape = <rect x={p} y={p} width={Math.max(0, w - sw)} height={Math.max(0, h - sw)} rx={el.radius ?? Math.min(w, h) * 0.12} />;
      break;
    case "triangle":
      shape = <polygon points={`${w / 2},${p} ${w - p},${h - p} ${p},${h - p}`} />;
      break;
    case "diamond":
      shape = <polygon points={`${w / 2},${p} ${w - p},${h / 2} ${w / 2},${h - p} ${p},${h / 2}`} />;
      break;
    case "arrow": {
      const head = Math.min(w * 0.4, h);
      shape = <polygon points={`${p},${h * 0.3} ${w - head},${h * 0.3} ${w - head},${p} ${w - p},${h / 2} ${w - head},${h - p} ${w - head},${h * 0.7} ${p},${h * 0.7}`} />;
      break;
    }
    case "star": {
      const pts: string[] = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 ? 0.4 : 1;
        pts.push(`${w / 2 + (r * (w / 2 - p)) * Math.cos(a)},${h / 2 + (r * (h / 2 - p)) * Math.sin(a) + (i % 2 ? 0 : h * 0.04)}`);
      }
      shape = <polygon points={pts.join(" ")} />;
      break;
    }
    case "line":
      return (
        <svg width={w} height={h} className="absolute inset-0 overflow-visible">
          <line x1={0} y1={h / 2} x2={w} y2={h / 2} stroke={el.stroke ?? accent} strokeWidth={Math.max(2, sw)} strokeLinecap="round" />
        </svg>
      );
    default:
      shape = <rect x={p} y={p} width={Math.max(0, w - sw)} height={Math.max(0, h - sw)} rx={el.radius ?? 0} />;
  }
  return (
    <svg width={w} height={h} className="absolute inset-0 overflow-visible" fill={fill} stroke={stroke} strokeWidth={sw}>
      {shape}
    </svg>
  );
}

/** Estilo del texto de un elemento. */
export function textStyle(el: SlideEl, t: Theme): CSSProperties {
  return {
    fontSize: el.fontSize ?? 28,
    fontFamily: elFont(el, t),
    color: elColor(el, t),
    textAlign: el.align ?? "left",
    fontWeight: el.bold ? 700 : 400,
    justifyContent: el.valign === "middle" ? "center" : el.valign === "bottom" ? "flex-end" : "flex-start",
    ["--slide-accent" as string]: t.accent,
  };
}

export function ElementView({ el, t, showPlaceholder }: { el: SlideEl; t: Theme; showPlaceholder?: boolean }) {
  const empty = !htmlText(el.html);
  return (
    <>
      {el.type === "shape" && <ShapeSvg el={el} accent={t.accent} />}
      {el.type === "image" && el.src && (
        <img
          src={el.src}
          alt=""
          draggable={false}
          className="absolute inset-0 size-full"
          style={{
            objectFit: el.fit ?? "fill",
            borderRadius: el.circle ? "50%" : el.radius,
            transform: el.flipH || el.flipV ? `scale(${el.flipH ? -1 : 1}, ${el.flipV ? -1 : 1})` : undefined,
            border: el.strokeW ? `${el.strokeW}px solid ${el.stroke ?? t.accent}` : undefined,
          }}
        />
      )}
      {el.type === "text" && (el.fill || el.strokeW) && (
        <div
          className="absolute inset-0"
          style={{
            background: el.fill && el.fill !== "transparent" ? el.fill : undefined,
            border: el.strokeW ? `${el.strokeW}px solid ${el.stroke ?? t.accent}` : undefined,
            borderRadius: el.radius,
          }}
        />
      )}
      {(el.type === "text" || el.type === "shape") && (
        <div className="slide-text-box" style={{ ...textStyle(el, t), lineHeight: el.lineHeight }}>
          {empty && showPlaceholder && el.placeholder ? (
            <div className="slide-placeholder">{el.placeholder}</div>
          ) : (
            <div className="slide-text" dangerouslySetInnerHTML={{ __html: el.html ?? "" }} />
          )}
        </div>
      )}
    </>
  );
}

export function elBoxStyle(el: SlideEl): CSSProperties {
  return {
    left: el.x,
    top: el.y,
    width: el.w,
    height: el.h,
    transform: el.rot ? `rotate(${el.rot}deg)` : undefined,
    opacity: el.opacity,
    filter: el.shadow ? "drop-shadow(0 8px 16px rgb(0 0 0 / 0.28))" : undefined,
  };
}

/** Fondo y adorno del tema. */
export function SlideBackground({ slide, t }: { slide: Slide; t: Theme }) {
  return (
    <>
      <div className="absolute inset-0" style={{ background: slide.bg ?? t.bg }} />
      {slide.bgImage && <img src={slide.bgImage} alt="" draggable={false} className="absolute inset-0 size-full object-cover" />}
      {t.band && <div className="absolute bottom-0 left-0 h-[10px] w-full" style={{ background: t.band }} />}
    </>
  );
}

/** Clase y variables de animación de un elemento en un paso dado de la presentación. */
export function animProps(el: SlideEl, entry: AnimStep | undefined, step: number | undefined): { className: string; style: CSSProperties } {
  if (step === undefined || !entry || !el.anim || el.anim === "none") return { className: "slide-el", style: {} };
  if (entry.step > step) return { className: "slide-el anim-hidden", style: {} };
  if (entry.step < step) return { className: "slide-el", style: {} };
  return {
    className: `slide-el anim anim-${el.anim}`,
    style: { ["--dur" as string]: `${entry.dur}s`, ["--delay" as string]: `${entry.start}s` },
  };
}

/**
 * Diapositiva completa a la escala indicada (miniaturas, impresión y presentación).
 * Con `step`, los elementos animados aparecen según ese paso.
 */
export function SlideView({ slide, themeId, scale, className, step }: { slide: Slide; themeId: string; scale: number; className?: string; step?: number }) {
  const t = getTheme(themeId);
  const timeline = step === undefined ? null : animTimeline(slide);
  return (
    <div className={className} style={{ width: SLIDE_W * scale, height: SLIDE_H * scale, position: "relative", overflow: "hidden" }}>
      <div className="slide-canvas" style={{ width: SLIDE_W, height: SLIDE_H, transform: `scale(${scale})`, transformOrigin: "0 0" }}>
        <SlideBackground slide={slide} t={t} />
        {slide.els.map((el) => {
          const a = animProps(el, timeline?.items.get(el.id), step);
          return (
            <div key={`${el.id}-${a.className}`} className={a.className} style={{ ...elBoxStyle(el), ...a.style }}>
              <ElementView el={el} t={t} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
