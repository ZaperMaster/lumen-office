import { useState } from "react";
import type { Evaluator } from "@/lib/sheet/formula";
import { parseRange, type Sheet, type Spark } from "@/lib/sheet/model";
import { Button, Dialog, Input, cn } from "@/components/ui";

import { L } from "@/lib/i18n";
/* Minigráficos: un gráfico pequeño de línea o columnas dentro de una celda. */

/** Números del rango de un minigráfico. */
export function sparkValues(spark: Spark, ev: Evaluator, si: number): number[] {
  const rg = parseRange(spark.range);
  if (!rg) return [];
  const out: number[] = [];
  for (let r = rg.r1; r <= rg.r2; r++)
    for (let c = rg.c1; c <= rg.c2; c++) {
      const v = ev.value(si, r, c);
      if (typeof v === "number") out.push(v);
    }
  return out;
}

export function SparkSvg({ values, type, color, w, h }: { values: number[]; type: Spark["type"]; color: string; w: number; h: number }) {
  if (values.length < 2 && type === "line") return null;
  const min = Math.min(0, ...values);
  const max = Math.max(...values, min + 1e-9);
  const pad = 3;
  const y = (v: number) => pad + (1 - (v - min) / (max - min || 1)) * (h - pad * 2);
  if (type === "column") {
    const bw = (w - pad * 2) / values.length;
    return (
      <svg width={w} height={h} className="pointer-events-none absolute inset-0">
        {values.map((v, i) => (
          <rect key={i} x={pad + i * bw + bw * 0.12} y={Math.min(y(v), y(0))} width={bw * 0.76} height={Math.max(1, Math.abs(y(0) - y(v)))} fill={v < 0 ? "#e53935" : color} />
        ))}
      </svg>
    );
  }
  const x = (i: number) => pad + (i / (values.length - 1)) * (w - pad * 2);
  const pts = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const iMax = values.indexOf(Math.max(...values));
  const iMin = values.indexOf(Math.min(...values));
  return (
    <svg width={w} height={h} className="pointer-events-none absolute inset-0">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
      <circle cx={x(iMax)} cy={y(values[iMax])} r={2.2} fill="#16a34a" />
      <circle cx={x(iMin)} cy={y(values[iMin])} r={2.2} fill="#dc2626" />
    </svg>
  );
}

export function SparkDialog({
  cell,
  initial,
  sheet,
  onClose,
  onSave,
}: {
  cell: string;
  initial: Spark;
  sheet: Sheet;
  onClose: () => void;
  onSave: (s: Spark | null) => void;
}) {
  const [sp, setSp] = useState<Spark>(initial);
  const ok = !!parseRange(sp.range);
  void sheet;
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={L("Minigráfico en {0}", cell)}
      description={L("Un gráfico pequeño dentro de la celda con los números de un rango (por ejemplo, las ventas de cada mes).")}
      footer={
        <>
          <Button variant="ghost" className="mr-auto text-red-500" onClick={() => onSave(null)}>{L("Quitar")}</Button>
          <Button variant="ghost" onClick={onClose}>{L("Cancelar")}</Button>
          <Button variant="primary" disabled={!ok} onClick={() => onSave({ ...sp, range: sp.range.toUpperCase() })}>{L("Aplicar")}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <label className="text-[12.5px] font-medium">
          {L("Datos")}
          <Input autoFocus value={sp.range} onChange={(e) => setSp({ ...sp, range: e.target.value })} placeholder="B2:M2" className={cn("mt-1 h-9 font-mono", !ok && "border-red-400")} />
        </label>
        <div className="flex gap-2">
          {(["line", "column"] as const).map((t) => (
            <button key={t} onClick={() => setSp({ ...sp, type: t })} className={cn("flex-1 rounded-md border px-3 py-2 text-[12.5px]", sp.type === t ? "border-accent bg-accent-soft text-accent" : "border-border hover:bg-surface-2")}>
              {t === "line" ? L("Línea") : L("Columnas")}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-3 text-[12.5px] font-medium">
          {L("Color")}
          <input type="color" value={sp.color ?? "#4f7cff"} onChange={(e) => setSp({ ...sp, color: e.target.value })} className="h-8 w-12 cursor-pointer rounded border border-border" />
        </label>
      </div>
    </Dialog>
  );
}
