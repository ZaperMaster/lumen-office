import { useState } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { CHART_TYPES, ChartSvg } from "@/components/sheet/Chart";
import { chartHeight, type DocChart } from "@/components/editor/docBlocks";
import { Button, Dialog, Input, cn } from "@/components/ui";

/** Gráfico dentro del documento: se ve en el editor y se edita con doble clic. */
export function DocChartView({ node, updateAttributes, selected, editor }: NodeViewProps) {
  const chart = node.attrs.chart as DocChart;
  const [editing, setEditing] = useState(false);
  return (
    <NodeViewWrapper className={cn("doc-chart-wrap group", selected && "is-selected")} data-drag-handle="" onDoubleClick={() => editor.isEditable && setEditing(true)}>
      <div className="doc-chart-box" style={{ width: "100%", maxWidth: chart.width }}>
        <ChartSvg type={chart.type} data={chart} width={chart.width} height={chartHeight(chart)} title={chart.title || undefined} legend={chart.legend} />
        {editor.isEditable && (
          <button className="doc-chart-edit no-print" onClick={() => setEditing(true)} contentEditable={false}>
            <Pencil className="size-3.5" /> Editar datos
          </button>
        )}
      </div>
      {editing && <ChartDialog initial={chart} onClose={() => setEditing(false)} onSave={(c) => updateAttributes({ chart: c })} />}
    </NodeViewWrapper>
  );
}

/** Tabla de datos del gráfico: la primera columna son las categorías y cada columna siguiente, una serie. */
export function ChartDialog({ initial, onClose, onSave, insert }: { initial: DocChart; onClose: () => void; onSave: (c: DocChart) => void; insert?: boolean }) {
  const [c, setC] = useState<DocChart>(() => structuredClone(initial));
  const set = (patch: Partial<DocChart>) => setC((p) => ({ ...p, ...patch }));
  const num = (v: string) => {
    const n = Number(v.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  };
  // Pegar desde una hoja de cálculo (filas con tabuladores)
  const onPaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text/plain");
    if (!text.includes("\t")) return;
    e.preventDefault();
    const rows = text.trim().split(/\r?\n/).map((r) => r.split("\t"));
    if (rows.length < 2 || rows[0].length < 2) return;
    set({
      categories: rows.slice(1).map((r) => r[0]),
      series: rows[0].slice(1).map((name, i) => ({ name, values: rows.slice(1).map((r) => num(r[i + 1] ?? "")) })),
    });
  };
  const cell = "h-8 w-full rounded border border-border bg-surface px-2 text-[13px] outline-none focus:border-accent";
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={insert ? "Insertar gráfico" : "Datos del gráfico"}
      className="!w-[min(94vw,760px)]"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={() => { onSave(c); onClose(); }}>{insert ? "Insertar" : "Guardar"}</Button>
        </>
      }
    >
      <div className="grid grid-cols-[1fr_260px] gap-4">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {CHART_TYPES.filter((t) => t.id !== "scatter").map((t) => (
              <button key={t.id} onClick={() => set({ type: t.id })} className={cn("rounded-md border px-2.5 py-1 text-[12.5px]", c.type === t.id ? "border-accent bg-accent/10 text-accent" : "border-border hover:bg-surface-2")}>
                {t.label}
              </button>
            ))}
          </div>
          <Input value={c.title} onChange={(e) => set({ title: e.target.value })} placeholder="Título del gráfico" className="mb-2" />
          <div className="max-h-[300px] overflow-auto" onPaste={onPaste}>
            <table className="w-full border-separate border-spacing-1 text-[13px]">
              <thead>
                <tr>
                  <th className="w-[34%] text-left text-[11.5px] font-medium text-muted">Categoría</th>
                  {c.series.map((s, si) => (
                    <th key={si}>
                      <div className="flex items-center gap-1">
                        <input className={cell + " font-semibold"} value={s.name} onChange={(e) => set({ series: c.series.map((x, j) => (j === si ? { ...x, name: e.target.value } : x)) })} />
                        {c.series.length > 1 && (
                          <button title="Quitar serie" className="text-muted hover:text-red-500" onClick={() => set({ series: c.series.filter((_, j) => j !== si) })}>
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {c.categories.map((cat, ri) => (
                  <tr key={`${ri}-${c.categories.length}`}>
                    <td className="flex items-center gap-1">
                      <input className={cell} value={cat} onChange={(e) => set({ categories: c.categories.map((x, j) => (j === ri ? e.target.value : x)) })} />
                      {c.categories.length > 1 && (
                        <button title="Quitar fila" className="text-muted hover:text-red-500" onClick={() => set({ categories: c.categories.filter((_, j) => j !== ri), series: c.series.map((s) => ({ ...s, values: s.values.filter((_, j) => j !== ri) })) })}>
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </td>
                    {c.series.map((s, si) => (
                      <td key={si}>
                        <input
                          className={cell + " text-right tabular-nums"}
                          defaultValue={String(s.values[ri] ?? 0).replace(".", ",")}
                          onChange={(e) => set({ series: c.series.map((x, j) => (j === si ? { ...x, values: c.categories.map((_, k) => (k === ri ? num(e.target.value) : (x.values[k] ?? 0))) } : x)) })}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex gap-2">
            <Button size="sm" icon={<Plus />} onClick={() => set({ categories: [...c.categories, `Elemento ${c.categories.length + 1}`], series: c.series.map((s) => ({ ...s, values: [...s.values, 0] })) })}>Fila</Button>
            <Button size="sm" icon={<Plus />} onClick={() => set({ series: [...c.series, { name: `Serie ${c.series.length + 1}`, values: c.categories.map(() => 0) }] })}>Serie</Button>
            <span className="self-center text-[11.5px] text-muted">También puedes pegar una tabla copiada de una hoja de cálculo.</span>
          </div>
        </div>
        <div>
          <div className="rounded-lg border border-border bg-white p-1 text-[#33363f]">
            <ChartSvg type={c.type} data={c} width={250} height={170} title={c.title || undefined} legend={c.legend} />
          </div>
          <label className="mt-3 flex items-center gap-2 text-[12.5px]">
            <input type="checkbox" checked={c.legend} onChange={(e) => set({ legend: e.target.checked })} /> Mostrar leyenda
          </label>
          <label className="mt-2 block text-[12.5px]">
            Ancho: {c.width} px
            <input type="range" min={280} max={640} step={10} value={c.width} onChange={(e) => set({ width: Number(e.target.value) })} className="w-full" />
          </label>
        </div>
      </div>
    </Dialog>
  );
}
