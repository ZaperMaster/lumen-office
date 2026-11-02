import { useState } from "react";
import { FileDown, Printer } from "lucide-react";
import { parseRange, type PrintSetup } from "@/lib/sheet/model";
import { Button, Dialog, Input, Switch, cn } from "@/components/ui";

/* Configurar página de una hoja: orientación, márgenes, ajustar al ancho, títulos y área. */
export function PrintSetupDialog({
  initial,
  selection,
  onClose,
  onSave,
  onPrint,
  onPdf,
}: {
  initial: PrintSetup;
  /** Rango seleccionado (para «usar la selección» como área) */
  selection: string;
  onClose: () => void;
  onSave: (p: PrintSetup) => void;
  onPrint: (p: PrintSetup) => void;
  onPdf: (p: PrintSetup) => void;
}) {
  const [p, setP] = useState<PrintSetup>({ landscape: true, margins: "normal", fitWidth: true, gridlines: true, repeatRows: 0, ...initial });
  const set = (patch: Partial<PrintSetup>) => setP((x) => ({ ...x, ...patch }));
  const areaOk = !p.area || !!parseRange(p.area);
  const opt = (on: boolean) => cn("flex-1 rounded-md border px-3 py-2 text-[12.5px]", on ? "border-accent bg-accent-soft text-accent" : "border-border hover:bg-surface-2");
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Configurar página"
      description="Cómo se imprime esta hoja (y cómo sale en el PDF)."
      className="w-[min(94vw,520px)]"
      footer={
        <>
          <Button variant="ghost" className="mr-auto" onClick={() => onSave(p)} disabled={!areaOk}>Guardar</Button>
          <Button variant="outline" icon={<FileDown className="size-4" />} onClick={() => onPdf(p)} disabled={!areaOk}>Guardar como PDF</Button>
          <Button variant="primary" icon={<Printer className="size-4" />} onClick={() => onPrint(p)} disabled={!areaOk}>Imprimir</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <div className="mb-1.5 text-[12.5px] font-medium">Orientación</div>
          <div className="flex gap-2">
            <button onClick={() => set({ landscape: false })} className={opt(!p.landscape)}>Vertical</button>
            <button onClick={() => set({ landscape: true })} className={opt(!!p.landscape)}>Horizontal</button>
          </div>
        </div>
        <div>
          <div className="mb-1.5 text-[12.5px] font-medium">Márgenes</div>
          <div className="flex gap-2">
            {([["narrow", "Estrechos"], ["normal", "Normales"], ["wide", "Anchos"]] as const).map(([v, l]) => (
              <button key={v} onClick={() => set({ margins: v })} className={opt((p.margins ?? "normal") === v)}>{l}</button>
            ))}
          </div>
        </div>
        <label className="flex items-center justify-between text-[12.5px] font-medium">
          Ajustar todas las columnas en una página de ancho
          <Switch checked={!!p.fitWidth} onChange={(v) => set({ fitWidth: v })} />
        </label>
        <label className="flex items-center justify-between text-[12.5px] font-medium">
          Imprimir las líneas de la cuadrícula
          <Switch checked={p.gridlines !== false} onChange={(v) => set({ gridlines: v })} />
        </label>
        <label className="flex items-center justify-between text-[12.5px] font-medium">
          Filas de títulos que se repiten en cada página
          <Input type="number" min={0} max={20} value={p.repeatRows ?? 0} onChange={(e) => set({ repeatRows: Math.max(0, Math.min(20, Number(e.target.value) || 0)) })} className="h-8 w-20" />
        </label>
        <div>
          <div className="mb-1.5 flex items-center justify-between text-[12.5px] font-medium">
            Área de impresión
            <button onClick={() => set({ area: selection })} className="text-[12px] font-normal text-accent hover:underline">Usar la selección ({selection})</button>
          </div>
          <Input value={p.area ?? ""} onChange={(e) => set({ area: e.target.value.toUpperCase() || undefined })} placeholder="Todo lo que tiene datos" className={cn("h-9 font-mono", !areaOk && "border-red-400")} />
        </div>
      </div>
    </Dialog>
  );
}
