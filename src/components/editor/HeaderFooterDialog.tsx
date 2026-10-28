import { useEffect, useRef, useState } from "react";
import { FIELDS, withDefaults, type HeaderFooter, type PageLayout, type Slot } from "@/lib/pageLayout";
import { Button, Dialog, Input, Switch, cn } from "@/components/ui";

const SLOTS: { id: Slot; label: string }[] = [
  { id: "left", label: "Izquierda" },
  { id: "center", label: "Centro" },
  { id: "right", label: "Derecha" },
];

type Zone = "header" | "footer";

/** Ventana para editar el encabezado, el pie y la numeración, como en Word. */
export function HeaderFooterDialog({
  open,
  zone,
  layout,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  zone: Zone;
  layout: PageLayout | null | undefined;
  onOpenChange: (o: boolean) => void;
  onSave: (layout: PageLayout) => void;
}) {
  const [draft, setDraft] = useState<PageLayout>(() => withDefaults(layout));
  // Último campo donde estaba el cursor, para insertar ahí los campos
  const focused = useRef<{ zone: Zone; slot: Slot; el: HTMLInputElement } | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(withDefaults(layout));
      focused.current = null;
    }
  }, [open, layout]);

  const setSlot = (z: Zone, slot: Slot, value: string) => setDraft((d) => ({ ...d, [z]: { ...d[z], [slot]: value } }));

  const insertField = (token: string) => {
    const f = focused.current ?? { zone, slot: "center" as Slot, el: null as unknown as HTMLInputElement };
    const current = draft[f.zone][f.slot];
    const start = f.el?.selectionStart ?? current.length;
    const end = f.el?.selectionEnd ?? current.length;
    const next = current.slice(0, start) + token + current.slice(end);
    setSlot(f.zone, f.slot, next);
    requestAnimationFrame(() => {
      if (!f.el) return;
      f.el.focus();
      f.el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const section = (z: Zone, title: string) => (
    <div className={cn("rounded-[var(--radius)] border p-3", z === zone ? "border-accent/50" : "border-border")}>
      <div className="mb-2 text-[13px] font-semibold">{title}</div>
      <div className="grid grid-cols-3 gap-2">
        {SLOTS.map((s) => (
          <label key={s.id} className="text-[11.5px] text-muted">
            {s.label}
            <Input
              value={draft[z][s.id]}
              autoFocus={z === zone && s.id === "center"}
              onChange={(e) => setSlot(z, s.id, e.target.value)}
              onFocus={(e) => (focused.current = { zone: z, slot: s.id, el: e.currentTarget })}
              onSelect={(e) => (focused.current = { zone: z, slot: s.id, el: e.currentTarget })}
              placeholder="—"
              className={cn("mt-1 h-8 text-[12.5px]", s.id === "center" && "text-center", s.id === "right" && "text-right")}
            />
          </label>
        ))}
      </div>
    </div>
  );

  const clear = (z: Zone) => setDraft((d) => ({ ...d, [z]: { left: "", center: "", right: "" } as HeaderFooter }));

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Encabezado y pie de página"
      description="Lo que escribas aquí aparece en todas las páginas. Usa los campos para el número de página y otros datos."
      className="w-[min(94vw,640px)]"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              onSave(draft);
              onOpenChange(false);
            }}
          >
            Aplicar
          </Button>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[12px] text-muted">Insertar campo:</span>
        {FIELDS.map((f) => (
          <button
            key={f.token}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insertField(f.token)}
            className="h-7 rounded-full border border-border px-2.5 text-[12px] hover:border-accent hover:text-accent"
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="grid gap-3">
        {section("header", "Encabezado (arriba)")}
        {section("footer", "Pie de página (abajo)")}
      </div>
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="ghost" onClick={() => clear("header")}>
          Quitar encabezado
        </Button>
        <Button size="sm" variant="ghost" onClick={() => clear("footer")}>
          Quitar pie
        </Button>
      </div>
      <div className="mt-4 grid gap-3 border-t border-border pt-4">
        <label className="flex items-center justify-between gap-4 text-[13px]">
          <span>
            Primera página diferente
            <span className="block text-[12px] text-muted">Sin encabezado ni pie en la primera página (portada).</span>
          </span>
          <Switch checked={draft.differentFirstPage} onChange={(v) => setDraft((d) => ({ ...d, differentFirstPage: v }))} label="Primera página diferente" />
        </label>
        <label className="flex items-center justify-between gap-4 text-[13px]">
          <span>
            Empezar la numeración en
            <span className="block text-[12px] text-muted">Número que lleva la primera página.</span>
          </span>
          <Input
            type="number"
            min={0}
            value={draft.startNumber}
            onChange={(e) => setDraft((d) => ({ ...d, startNumber: Math.max(0, parseInt(e.target.value, 10) || 0) }))}
            className="h-8 w-20 text-center"
          />
        </label>
      </div>
    </Dialog>
  );
}
