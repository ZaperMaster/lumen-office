import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Dialog } from "@/components/ui";
import type { SlideTable } from "@/lib/slides/model";

export const SAMPLE_TABLE: SlideTable = {
  header: true,
  rows: [
    ["Producto", "Precio", "Ventas"],
    ["Básico", "9 €", "1.200"],
    ["Profesional", "19 €", "850"],
    ["Empresa", "49 €", "310"],
  ],
};

/** Tabla de una diapositiva: se escribe en la cuadrícula o se pega desde una hoja de cálculo. */
export function TableDialog({ initial, onClose, onSave, insert }: { initial: SlideTable; onClose: () => void; onSave: (t: SlideTable) => void; insert?: boolean }) {
  const [t, setT] = useState<SlideTable>(() => structuredClone(initial));
  const cols = Math.max(1, ...t.rows.map((r) => r.length));
  const setCell = (ri: number, ci: number, v: string) =>
    setT((p) => ({ ...p, rows: p.rows.map((r, i) => (i === ri ? Array.from({ length: cols }, (_, j) => (j === ci ? v : (r[j] ?? ""))) : r)) }));
  const onPaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text/plain");
    if (!text.includes("\t")) return;
    e.preventDefault();
    setT((p) => ({ ...p, rows: text.trim().split(/\r?\n/).map((r) => r.split("\t")) }));
  };
  const cell = "h-8 w-full min-w-[90px] rounded border border-border bg-surface px-2 text-[13px] outline-none focus:border-accent";
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={insert ? "Insertar tabla" : "Editar tabla"}
      className="!w-[min(94vw,760px)]"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={() => { onSave({ ...t, rows: t.rows.map((r) => Array.from({ length: cols }, (_, j) => r[j] ?? "")) }); onClose(); }}>
            {insert ? "Insertar" : "Guardar"}
          </Button>
        </>
      }
    >
      <div className="max-h-[50vh] overflow-auto" onPaste={onPaste}>
        <table className="border-separate border-spacing-1">
          <tbody>
            {t.rows.map((r, ri) => (
              <tr key={`${ri}-${t.rows.length}`}>
                {Array.from({ length: cols }, (_, ci) => (
                  <td key={ci}>
                    <input className={cell + (ri === 0 && t.header ? " font-semibold" : "")} defaultValue={r[ci] ?? ""} onChange={(e) => setCell(ri, ci, e.target.value)} />
                  </td>
                ))}
                <td>
                  {t.rows.length > 1 && (
                    <button title="Quitar fila" className="text-muted hover:text-red-500" onClick={() => setT((p) => ({ ...p, rows: p.rows.filter((_, i) => i !== ri) }))}>
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            <tr>
              {Array.from({ length: cols }, (_, ci) => (
                <td key={ci} className="text-center">
                  {cols > 1 && (
                    <button title="Quitar columna" className="text-muted hover:text-red-500" onClick={() => setT((p) => ({ ...p, rows: p.rows.map((r) => r.filter((_, j) => j !== ci)) }))}>
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" icon={<Plus />} onClick={() => setT((p) => ({ ...p, rows: [...p.rows, Array(cols).fill("")] }))}>Fila</Button>
        <Button size="sm" icon={<Plus />} onClick={() => setT((p) => ({ ...p, rows: p.rows.map((r) => [...r, ""]) }))}>Columna</Button>
        <label className="ml-2 flex items-center gap-2 text-[12.5px]">
          <input type="checkbox" checked={t.header} onChange={(e) => setT((p) => ({ ...p, header: e.target.checked }))} /> Primera fila como encabezado
        </label>
        <span className="text-[11.5px] text-muted">También puedes pegar una tabla copiada de una hoja de cálculo.</span>
      </div>
    </Dialog>
  );
}
