import { useEffect, useRef, useState } from "react";
import { Check, Trash2 } from "lucide-react";
import { FIELDS, withDefaults, type HeaderFooter, type PageLayout, type Slot } from "@/lib/pageLayout";
import { Switch, cn } from "@/components/ui";

/*
 * Edición del encabezado o del pie directamente en la página (como en Google
 * Docs): tres cuadros (izquierda, centro y derecha) en el margen y una barra
 * pequeña para insertar campos y elegir «primera página diferente».
 */

const SLOTS: { slot: Slot; label: string }[] = [
  { slot: "left", label: "Izquierda" },
  { slot: "center", label: "Centro" },
  { slot: "right", label: "Derecha" },
];

export function HeaderFooterBar({
  zone,
  top,
  height,
  paddingX,
  layout,
  onChange,
  onClose,
}: {
  zone: "header" | "footer";
  /** Posición de la zona dentro de la página (px sin zoom) */
  top: number;
  height: number;
  paddingX: number;
  layout: PageLayout | null | undefined;
  onChange: (next: PageLayout) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(() => withDefaults(layout));
  const [focusSlot, setFocusSlot] = useState<Slot>(zone === "footer" ? "center" : "left");
  const inputs = useRef<Record<Slot, HTMLInputElement | null>>({ left: null, center: null, right: null });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const ref = useRef<HTMLDivElement>(null);

  // Se guarda poco después de escribir (y al cerrar)
  const latest = useRef(draft);
  latest.current = draft;
  const update = (next: PageLayout) => {
    setDraft(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onChange(next), 250);
  };
  const close = () => {
    clearTimeout(timer.current);
    onChange(latest.current);
    onClose();
  };
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    setTimeout(() => inputs.current[focusSlot]?.focus(), 0);
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) closeRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hf = draft[zone];
  const setSlot = (slot: Slot, text: string) => update({ ...draft, [zone]: { ...hf, [slot]: text } as HeaderFooter });
  const insert = (token: string) => {
    // El cuadro donde está el cursor (o el último que lo tuvo)
    const active = (Object.keys(inputs.current) as Slot[]).find((k) => inputs.current[k] === document.activeElement) ?? focusSlot;
    const el = inputs.current[active];
    const cur = hf[active];
    const start = el?.selectionStart ?? cur.length;
    const end = el?.selectionEnd ?? cur.length;
    const sep = start > 0 && !/\s$/.test(cur.slice(0, start)) ? " " : "";
    setSlot(active, cur.slice(0, start) + sep + token + cur.slice(end));
    setTimeout(() => {
      el?.focus();
      const p = start + sep.length + token.length;
      el?.setSelectionRange(p, p);
    }, 0);
  };

  const bar = (
    <div
      className={cn(
        "absolute right-0 left-0 z-20 mx-auto flex w-max max-w-full flex-wrap items-center gap-1.5 rounded-[var(--radius)] border border-border bg-surface px-2.5 py-1.5 text-text shadow-soft",
        zone === "header" ? "top-full mt-1.5" : "bottom-full mb-1.5",
      )}
      style={{ fontFamily: "var(--ui-font)", fontSize: 12.5 }}
    >
      <span className="mr-1 font-semibold">{zone === "header" ? "Encabezado" : "Pie de página"}</span>
      {FIELDS.map((f) => (
        <button
          key={f.token}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => insert(f.token)}
          className="rounded-full bg-accent-soft px-2 py-0.5 text-[11.5px] font-medium text-accent hover:brightness-95"
          title={`Insertar ${f.label.toLowerCase()}`}
        >
          + {f.label}
        </button>
      ))}
      <span className="mx-1 h-5 w-px bg-border" />
      <label className="flex items-center gap-1.5 text-[12px]">
        <Switch checked={draft.differentFirstPage} onChange={(v) => update({ ...draft, differentFirstPage: v })} label="Primera página diferente" />
        Primera página diferente
      </label>
      <label className="flex items-center gap-1 text-[12px]">
        Empezar en
        <input
          type="number"
          min={0}
          value={draft.startNumber}
          onChange={(e) => update({ ...draft, startNumber: Math.max(0, Number(e.target.value) || 0) })}
          className="h-6 w-12 rounded border border-border bg-surface px-1 text-right outline-none focus:border-accent"
        />
      </label>
      <span className="mx-1 h-5 w-px bg-border" />
      <button
        onClick={() => update({ ...draft, [zone]: { left: "", center: "", right: "" } })}
        className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] text-muted hover:bg-surface-2 hover:text-red-500"
        title="Vaciar"
      >
        <Trash2 className="size-3.5" /> Quitar
      </button>
      <button onClick={close} className="flex items-center gap-1 rounded-md bg-accent px-2 py-0.5 text-[12px] font-medium text-accent-fg hover:brightness-110">
        <Check className="size-3.5" /> Listo
      </button>
    </div>
  );

  return (
    <div ref={ref} className="hf-editing absolute right-0 left-0 z-10" style={{ top, height }}>
      <div
        className={cn("absolute inset-x-0 flex gap-2", zone === "header" ? "bottom-2" : "top-2")}
        style={{ paddingLeft: paddingX, paddingRight: paddingX }}
      >
        {SLOTS.map(({ slot, label }) => (
          <input
            key={slot}
            ref={(el) => {
              inputs.current[slot] = el;
            }}
            value={hf[slot]}
            onChange={(e) => setSlot(slot, e.target.value)}
            onFocus={() => setFocusSlot(slot)}
            onKeyDown={(e) => {
              if (e.key === "Enter") close();
            }}
            placeholder={label}
            className={cn(
              "h-8 min-w-0 flex-1 rounded-md border border-dashed border-accent/60 bg-accent-soft/40 px-2 text-[12px] text-paper-text outline-none placeholder:text-paper-text/35 focus:border-solid focus:border-accent",
              slot === "center" && "text-center",
              slot === "right" && "text-right",
            )}
          />
        ))}
      </div>
      {bar}
    </div>
  );
}
