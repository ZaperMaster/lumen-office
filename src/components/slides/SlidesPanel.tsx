import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, Circle, FlipHorizontal, FlipVertical, ImagePlus, Play, Sparkles, Trash2, X } from "lucide-react";
import { ANIMS, TRANSITIONS, TRIGGERS, animLabel, htmlText, type Anim, type AnimTrigger, type Slide, type SlideEl, type Theme, type Transition } from "@/lib/slides/model";
import { Button, Slider, Switch, cn } from "@/components/ui";

/*
 * Panel lateral de formato de las presentaciones: posición y tamaño, relleno,
 * contorno, esquinas, sombra, imagen, animaciones y fondo de la diapositiva.
 */


function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-border px-4 py-3">
      <h3 className="mb-2.5 text-[11.5px] font-semibold tracking-wide text-muted uppercase">{title}</h3>
      <div className="flex flex-col gap-2.5">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3 text-[12.5px]">
      <span className="shrink-0">{label}</span>
      {children}
    </label>
  );
}

function Num({ value, onChange, min, max, step = 1, suffix }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; suffix?: string }) {
  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        value={Math.round(value * 100) / 100}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
        onKeyDown={(e) => e.stopPropagation()}
        className="h-7 w-[68px] rounded-md border border-border bg-surface px-1.5 text-right text-[12px] outline-none focus:border-accent"
      />
      {suffix && <span className="w-3 text-[11px] text-muted">{suffix}</span>}
    </div>
  );
}

function ColorRow({ label, value, onChange, onClear, clearLabel }: { label: string; value?: string; onChange: (c: string) => void; onClear: () => void; clearLabel: string }) {
  const hex = value && /^#[0-9a-f]{6}/i.test(value) ? value.slice(0, 7) : "#ffffff";
  const none = !value || value === "transparent";
  return (
    <Row label={label}>
      <div className="flex items-center gap-1.5">
        <input type="color" value={hex} onChange={(e) => onChange(e.target.value)} className="h-7 w-9 cursor-pointer rounded border border-border bg-transparent" />
        <button onClick={onClear} className={cn("rounded-md px-1.5 py-0.5 text-[11.5px]", none ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2")}>{clearLabel}</button>
      </div>
    </Row>
  );
}

export function SlidesPanel({
  slide,
  index,
  t,
  selected,
  onEl,
  onSlide,
  onSelect,
  onReplaceImage,
  onBgImage,
  onPreview,
  onClose,
  onApplyTransitionAll,
}: {
  slide: Slide;
  index: number;
  t: Theme;
  selected: SlideEl[];
  onEl: (patch: Partial<SlideEl> | ((e: SlideEl) => SlideEl)) => void;
  onSlide: (fn: (s: Slide) => Slide) => void;
  onSelect: (id: string) => void;
  onReplaceImage: () => void;
  onBgImage: () => void;
  onPreview: () => void;
  onClose: () => void;
  onApplyTransitionAll: () => void;
}) {
  const one = selected.length === 1 ? selected[0] : null;
  const animated = slide.els.filter((e) => e.anim && e.anim !== "none");
  const name = (e: SlideEl) =>
    e.type === "image" ? "Imagen" : htmlText(e.html).slice(0, 26) || (e.type === "shape" ? "Forma" : "Cuadro de texto");

  /** Cambia el orden de aparición moviendo el elemento en la lista. */
  const moveAnim = (id: string, dir: -1 | 1) =>
    onSlide((s) => {
      const list = s.els.filter((e) => e.anim && e.anim !== "none");
      const i = list.findIndex((e) => e.id === id);
      const j = i + dir;
      if (j < 0 || j >= list.length) return s;
      const els = [...s.els];
      const a = els.findIndex((e) => e.id === list[i].id);
      const b = els.findIndex((e) => e.id === list[j].id);
      [els[a], els[b]] = [els[b], els[a]];
      return { ...s, els };
    });

  return (
    <aside className="no-print flex w-[268px] shrink-0 flex-col overflow-y-auto border-l border-border bg-surface" onMouseDown={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span className="text-[13px] font-semibold">{one ? "Formato del elemento" : selected.length > 1 ? `${selected.length} elementos` : `Diapositiva ${index + 1}`}</span>
        <button onClick={onClose} className="grid size-6 place-items-center rounded-md text-muted hover:bg-surface-2" aria-label="Cerrar panel"><X className="size-4" /></button>
      </div>

      {one && (
        <Section title="Posición y tamaño">
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            <Row label="X"><Num value={one.x} onChange={(v) => onEl({ x: v })} /></Row>
            <Row label="Y"><Num value={one.y} onChange={(v) => onEl({ y: v })} /></Row>
            <Row label="Ancho"><Num value={one.w} min={10} onChange={(v) => onEl((e) => (e.type === "image" ? { ...e, w: v, h: (e.h * v) / e.w } : { ...e, w: v }))} /></Row>
            <Row label="Alto"><Num value={one.h} min={10} onChange={(v) => onEl((e) => (e.type === "image" ? { ...e, h: v, w: (e.w * v) / e.h } : { ...e, h: v }))} /></Row>
          </div>
          <Row label="Giro"><Num value={one.rot ?? 0} min={-360} max={360} onChange={(v) => onEl({ rot: v || undefined })} suffix="°" /></Row>
          {one.type === "image" && <p className="text-[11px] text-muted">Las imágenes conservan su proporción al cambiar el ancho o el alto.</p>}
        </Section>
      )}

      {selected.length > 0 && (
        <Section title="Estilo">
          {(one?.type !== "image" || !one) && (
            <ColorRow
              label="Relleno"
              value={one?.fill}
              onChange={(c) => onEl({ fill: c })}
              onClear={() => onEl((e) => ({ ...e, fill: e.type === "shape" ? "transparent" : undefined }))}
              clearLabel="Sin relleno"
            />
          )}
          <ColorRow label="Contorno" value={one?.strokeW ? one.stroke ?? t.accent : undefined} onChange={(c) => onEl((e) => ({ ...e, stroke: c, strokeW: e.strokeW || 3 }))} onClear={() => onEl({ strokeW: 0 })} clearLabel="Sin contorno" />
          {!!one?.strokeW && (
            <Row label="Grosor">
              <Slider value={one.strokeW} min={1} max={20} onChange={(v) => onEl({ strokeW: v })} className="w-[120px]" label="Grosor del contorno" />
            </Row>
          )}
          {(one?.type === "image" || one?.type === "text" || one?.shape === "rect") && (
            <Row label="Esquinas">
              <Slider value={one.radius ?? 0} min={0} max={Math.round(Math.min(one.w, one.h) / 2)} onChange={(v) => onEl({ radius: v || undefined })} className="w-[120px]" label="Esquinas redondeadas" />
            </Row>
          )}
          <Row label="Opacidad">
            <Slider value={Math.round((one?.opacity ?? 1) * 100)} min={10} max={100} step={5} onChange={(v) => onEl({ opacity: v >= 100 ? undefined : v / 100 })} className="w-[120px]" label="Opacidad" />
          </Row>
          <Row label="Sombra">
            <Switch checked={!!one?.shadow} onChange={(v) => onEl({ shadow: v || undefined })} label="Sombra" />
          </Row>
          {(one?.type === "text" || one?.type === "shape") && (
            <Row label="Interlineado">
              <Slider value={Math.round((one.lineHeight ?? 1.22) * 100)} min={90} max={220} step={5} onChange={(v) => onEl({ lineHeight: v / 100 })} className="w-[120px]" label="Interlineado" />
            </Row>
          )}
        </Section>
      )}

      {one?.type === "image" && (
        <Section title="Imagen">
          <Button size="sm" variant="outline" icon={<ImagePlus className="size-3.5" />} onClick={onReplaceImage}>Cambiar imagen</Button>
          <div className="flex gap-1">
            {([["fill", "Estirar"], ["cover", "Rellenar"], ["contain", "Encajar"]] as const).map(([v, l]) => (
              <button key={v} onClick={() => onEl({ fit: v === "fill" ? undefined : v })} className={cn("flex-1 rounded-md border px-2 py-1 text-[12px]", (one.fit ?? "fill") === v ? "border-accent bg-accent-soft text-accent" : "border-border hover:bg-surface-2")}>
                {l}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            <Button size="sm" variant={one.flipH ? "secondary" : "ghost"} icon={<FlipHorizontal className="size-3.5" />} onClick={() => onEl({ flipH: !one.flipH || undefined })}>Voltear</Button>
            <Button size="sm" variant={one.flipV ? "secondary" : "ghost"} icon={<FlipVertical className="size-3.5" />} onClick={() => onEl({ flipV: !one.flipV || undefined })}>Vertical</Button>
            <Button size="sm" variant={one.circle ? "secondary" : "ghost"} icon={<Circle className="size-3.5" />} onClick={() => onEl({ circle: !one.circle || undefined })}>Círculo</Button>
          </div>
        </Section>
      )}

      {one && (
        <Section title="Animación">
          <Row label="Efecto">
            <select
              value={one.anim ?? "none"}
              onChange={(e) => {
                const a = e.target.value as Anim;
                onEl((x) => ({ ...x, anim: a, animTrigger: a === "none" ? undefined : (x.animTrigger ?? "click") }));
                if (a !== "none") setTimeout(onPreview, 50);
              }}
              className="h-7 max-w-[150px] rounded-md border border-border bg-surface px-1.5 text-[12px]"
            >
              <option value="none">Ninguna</option>
              <optgroup label="Entrada">
                {ANIMS.filter((a) => a.group === "Entrada").map((a) => <option key={a.id} value={a.id}>{a.icon} {a.label}</option>)}
              </optgroup>
              <optgroup label="Énfasis">
                {ANIMS.filter((a) => a.group === "Énfasis").map((a) => <option key={a.id} value={a.id}>{a.icon} {a.label}</option>)}
              </optgroup>
            </select>
          </Row>
          {one.anim && one.anim !== "none" && (
            <>
              <Row label="Inicio">
                <select value={one.animTrigger ?? "after"} onChange={(e) => onEl({ animTrigger: e.target.value as AnimTrigger })} className="h-7 max-w-[150px] rounded-md border border-border bg-surface px-1.5 text-[12px]">
                  {TRIGGERS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                </select>
              </Row>
              <Row label="Duración"><Num value={one.animDur ?? 0.6} min={0.1} max={10} step={0.1} onChange={(v) => onEl({ animDur: Math.max(0.1, v) })} suffix="s" /></Row>
              <Row label="Retraso"><Num value={one.animDelay ?? 0} min={0} max={30} step={0.1} onChange={(v) => onEl({ animDelay: Math.max(0, v) })} suffix="s" /></Row>
            </>
          )}
        </Section>
      )}

      <Section title={`Animaciones de esta diapositiva (${animated.length})`}>
        {!animated.length && <p className="text-[12px] text-muted">Ninguna. Selecciona un elemento y elige cómo aparece.</p>}
        {animated.map((e, i) => (
          <div key={e.id} className={cn("flex items-center gap-2 rounded-md border px-2 py-1.5", one?.id === e.id ? "border-accent bg-accent-soft" : "border-border")}>
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-bold text-accent-fg">{i + 1}</span>
            <button onClick={() => onSelect(e.id)} className="min-w-0 flex-1 truncate text-left text-[12px]">
              {name(e)}
              <span className="block text-[11px] text-muted">
                {ANIMS.find((a) => a.id === e.anim)?.icon} {animLabel(e.anim)} · {TRIGGERS.find((t) => t.id === (e.animTrigger ?? "after"))?.label}
              </span>
            </button>
            <button onClick={() => moveAnim(e.id, -1)} disabled={i === 0} className="text-muted hover:text-text disabled:opacity-30" aria-label="Antes"><ArrowUp className="size-3.5" /></button>
            <button onClick={() => moveAnim(e.id, 1)} disabled={i === animated.length - 1} className="text-muted hover:text-text disabled:opacity-30" aria-label="Después"><ArrowDown className="size-3.5" /></button>
          </div>
        ))}
        {animated.length > 0 && <Button size="sm" variant="outline" icon={<Play className="size-3.5" />} onClick={onPreview}>Vista previa</Button>}
      </Section>

      <Section title="Diapositiva">
        <Row label="Transición">
          <select
            value={slide.transition ?? "none"}
            onChange={(e) => onSlide((s) => ({ ...s, transition: e.target.value as Transition }))}
            className="h-7 rounded-md border border-border bg-surface px-1.5 text-[12px]"
          >
            {TRANSITIONS.map((x) => <option key={x.id} value={x.id}>{x.icon} {x.label}</option>)}
          </select>
        </Row>
        <button onClick={onApplyTransitionAll} className="self-end text-[11.5px] text-accent hover:underline">Aplicar a todas</button>
        <ColorRow label="Fondo" value={slide.bg} onChange={(c) => onSlide((s) => ({ ...s, bg: c }))} onClear={() => onSlide((s) => ({ ...s, bg: undefined }))} clearLabel="Del tema" />
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" icon={<ImagePlus className="size-3.5" />} onClick={onBgImage}>Imagen de fondo</Button>
          {slide.bgImage && <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => onSlide((s) => ({ ...s, bgImage: undefined }))}>Quitar</Button>}
        </div>
      </Section>
      <p className="flex items-center gap-1.5 px-4 py-3 text-[11px] text-muted">
        <Sparkles className="size-3" /> Las estrellas en las miniaturas indican qué diapositivas tienen animaciones.
      </p>
    </aside>
  );
}
