import { useState } from "react";
import { NUM_FORMATS } from "@/lib/sheet/format";
import type { CellStyle } from "@/lib/sheet/model";
import { FontPicker, FontSizePicker } from "@/components/editor/controls";
import { Button, Dialog, Input, cn } from "@/components/ui";

import { L } from "@/lib/i18n";
/* Formato de celdas (Ctrl+1): número, alineación, fuente, bordes y relleno en una sola ventana. */

export type BorderMode = "keep" | "none" | "outer" | "all" | "bottom" | "top";

const FILL_COLORS = [
  "#ffffff", "#f2f2f2", "#d9d9d9", "#bfbfbf", "#fff2cc", "#ffe699", "#fce4d6", "#f8cbad", "#ffc7ce", "#e2efda",
  "#c6efce", "#a9d08e", "#ddebf7", "#bdd7ee", "#9bc2e6", "#e4dfec", "#d9d2e9", "#4472c4", "#70ad47", "#ed7d31",
  "#ffc000", "#c00000", "#7030a0", "#000000",
];

const BORDER_OPTIONS: [BorderMode, string][] = [
  ["keep", L("Dejar como están")],
  ["none", L("Sin bordes")],
  ["outer", L("Contorno")],
  ["all", L("Todos los bordes")],
  ["bottom", L("Solo abajo")],
  ["top", L("Solo arriba")],
];

export function FormatCellsDialog({
  initial,
  merged,
  preview,
  onClose,
  onApply,
}: {
  initial: CellStyle;
  merged: boolean;
  /** Valor de la celda activa con un formato dado (vista previa) */
  preview: (st: CellStyle) => string;
  onClose: () => void;
  onApply: (st: CellStyle, border: BorderMode, merge: boolean) => void;
}) {
  const [tab, setTab] = useState<"num" | "align" | "font" | "border" | "fill">("num");
  const [st, setSt] = useState<CellStyle>({ ...initial });
  const [border, setBorder] = useState<BorderMode>("keep");
  const [merge, setMerge] = useState(merged);
  const set = (patch: Partial<CellStyle>) => setSt((s) => ({ ...s, ...patch }));
  const fmt = st.fmt ?? "general";
  const hasDec = ["number", "thousands", "currency", "percent", "scientific"].includes(fmt);
  const example = NUM_FORMATS.find((f) => f.id === fmt)?.example;
  const tabs = [
    { id: "num", label: L("Número") },
    { id: "align", label: L("Alineación") },
    { id: "font", label: L("Fuente") },
    { id: "border", label: L("Bordes") },
    { id: "fill", label: L("Relleno") },
  ] as const;
  const option = (on: boolean) => cn("rounded-md border px-3 py-1.5 text-left text-[12.5px]", on ? "border-accent bg-accent-soft text-accent" : "border-border hover:bg-surface-2");

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={L("Formato de celdas")}
      className="w-[min(94vw,600px)]"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{L("Cancelar")}</Button>
          <Button variant="primary" onClick={() => onApply(st, border, merge)}>{L("Aceptar")}</Button>
        </>
      }
    >
      <div className="mb-4 flex gap-1 rounded-[var(--radius)] bg-surface-2 p-1">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={cn("flex-1 rounded-md py-1.5 text-[12.5px] font-medium", tab === t.id ? "bg-surface shadow-sm" : "text-muted hover:text-text")}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "num" && (
        <div className="grid grid-cols-[200px_1fr] gap-4">
          <div className="flex flex-col gap-1">
            {NUM_FORMATS.map((f) => (
              <button key={f.id} onClick={() => set({ fmt: f.id === "general" ? undefined : f.id, dec: undefined })} className={option(fmt === f.id)}>
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-3">
            <div className="sheet-paper rounded-[var(--radius)] border border-border bg-paper px-3 py-3 text-paper-text">
              <div className="mb-1 text-[11px] opacity-60">{L("Vista previa")}</div>
              <div className="text-[18px] tabular-nums">{preview(st) || "—"}</div>
            </div>
            {hasDec && (
              <label className="flex items-center justify-between text-[12.5px] font-medium">
                {L("Decimales")}
                <Input type="number" min={0} max={10} value={st.dec ?? 2} onChange={(e) => set({ dec: Math.max(0, Math.min(10, Number(e.target.value))) })} className="h-8 w-20" />
              </label>
            )}
            {example && <p className="text-[12px] text-muted">{L("Ejemplo:")}{" "} {example}</p>}
          </div>
        </div>
      )}

      {tab === "align" && (
        <div className="grid grid-cols-2 gap-5">
          <div className="flex flex-col gap-1">
            <div className="mb-1 text-[11.5px] font-semibold tracking-wide text-muted uppercase">{L("Horizontal")}</div>
            {([[undefined, L("General (según el valor)")], ["left", L("Izquierda")], ["center", L("Centro")], ["right", L("Derecha")]] as const).map(([v, l]) => (
              <button key={l} onClick={() => set({ align: v })} className={option(st.align === v)}>{l}</button>
            ))}
          </div>
          <div className="flex flex-col gap-1">
            <div className="mb-1 text-[11.5px] font-semibold tracking-wide text-muted uppercase">{L("Vertical")}</div>
            {([["top", L("Arriba")], ["middle", L("Centro")], [undefined, L("Abajo")]] as const).map(([v, l]) => (
              <button key={l} onClick={() => set({ valign: v })} className={option(st.valign === v)}>{l}</button>
            ))}
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-[12.5px]">
              <input type="checkbox" checked={!!st.wrap} onChange={(e) => set({ wrap: e.target.checked || undefined })} /> {" "}{L("Ajustar el texto (varias líneas)")}
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-[12.5px]">
              <input type="checkbox" checked={merge} onChange={(e) => setMerge(e.target.checked)} /> {" "}{L("Combinar celdas")}
            </label>
          </div>
        </div>
      )}

      {tab === "font" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <FontPicker value={st.font ?? null} onChange={(css) => set({ font: css })} className="w-[220px]" placeholder={L("Predeterminada")} />
            <FontSizePicker value={st.fs ?? 11} onChange={(pt) => set({ fs: pt === 11 ? undefined : pt })} />
          </div>
          <div className="flex flex-wrap gap-4 text-[12.5px]">
            {([["b", L("Negrita")], ["i", L("Cursiva")], ["u", L("Subrayado")], ["s", L("Tachado")]] as const).map(([k, l]) => (
              <label key={k} className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={!!st[k]} onChange={(e) => set({ [k]: e.target.checked || undefined })} /> {l}
              </label>
            ))}
          </div>
          <label className="flex items-center gap-3 text-[12.5px] font-medium">
            {L("Color")}
            <input type="color" value={st.color ?? "#1c1e24"} onChange={(e) => set({ color: e.target.value })} className="h-8 w-12 cursor-pointer rounded border border-border" />
            <button onClick={() => set({ color: undefined })} className="text-[12px] text-accent hover:underline">{L("Automático")}</button>
          </label>
          <div className="sheet-paper rounded-[var(--radius)] border border-border bg-paper px-3 py-3 text-paper-text">
            <span
              style={{
                fontFamily: st.font,
                fontSize: (st.fs ?? 11) * 1.333,
                fontWeight: st.b ? 700 : 400,
                fontStyle: st.i ? "italic" : undefined,
                textDecoration: [st.u && "underline", st.s && "line-through"].filter(Boolean).join(" ") || undefined,
                color: st.color,
              }}
            >
              {L("AaBbCc 123")}
            </span>
          </div>
        </div>
      )}

      {tab === "border" && (
        <div className="grid grid-cols-3 gap-2">
          {BORDER_OPTIONS.map(([v, l]) => (
            <button key={v} onClick={() => setBorder(v)} className={cn(option(border === v), "flex flex-col items-center gap-2 py-3")}>
              <span
                className="block size-10 bg-surface-2"
                style={{
                  border: v === "all" || v === "outer" ? "2px solid currentColor" : undefined,
                  borderBottom: v === "bottom" ? "2px solid currentColor" : undefined,
                  borderTop: v === "top" ? "2px solid currentColor" : undefined,
                  backgroundImage: v === "all" ? "linear-gradient(currentColor,currentColor),linear-gradient(currentColor,currentColor)" : undefined,
                  backgroundSize: v === "all" ? "2px 100%, 100% 2px" : undefined,
                  backgroundPosition: "center",
                  backgroundRepeat: "no-repeat",
                  opacity: v === "keep" ? 0.4 : 1,
                }}
              />
              {l}
            </button>
          ))}
        </div>
      )}

      {tab === "fill" && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-10 gap-1.5">
            {FILL_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => set({ bg: c === "#ffffff" ? undefined : c })}
                title={c}
                className={cn("size-8 rounded-md border", (st.bg ?? "#ffffff") === c ? "border-accent ring-2 ring-accent" : "border-black/10")}
                style={{ background: c }}
              />
            ))}
          </div>
          <label className="flex items-center gap-3 text-[12.5px] font-medium">
            {L("Otro color")}
            <input type="color" value={st.bg ?? "#ffffff"} onChange={(e) => set({ bg: e.target.value })} className="h-8 w-12 cursor-pointer rounded border border-border" />
            <button onClick={() => set({ bg: undefined })} className="text-[12px] text-accent hover:underline">{L("Sin relleno")}</button>
          </label>
        </div>
      )}
    </Dialog>
  );
}
