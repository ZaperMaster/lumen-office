import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowDownAZ, ArrowDownZA, FilterX, Trash2 } from "lucide-react";
import type { Evaluator } from "@/lib/sheet/formula";
import { colName, key, parseRange, rangeToA1, uid, type CondRule, type CondType, type Range, type Sheet, type Validation } from "@/lib/sheet/model";
import { COND_LABELS, COND_PRESETS, filterRange, filterText } from "@/lib/sheet/view";
import { formatValue } from "@/lib/sheet/format";
import { PIVOT_FNS, type PivotFn, type PivotSpec } from "@/lib/sheet/pivot";
import { Button, Dialog, Input, cn } from "@/components/ui";

/* ------------------------------------------------------------------ */
/*  Menú del filtro de una columna                                     */
/* ------------------------------------------------------------------ */

export function FilterMenu({
  sheet,
  ev,
  si,
  col,
  x,
  y,
  onClose,
  onApply,
  onSort,
}: {
  sheet: Sheet;
  ev: Evaluator;
  si: number;
  col: number;
  x: number;
  y: number;
  onClose: () => void;
  /** null = mostrar todo en esta columna */
  onApply: (values: string[] | null) => void;
  onSort: (asc: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const f = sheet.filter!;
  const values = useMemo(() => {
    const rg = filterRange(sheet, f);
    const set = new Map<string, number>();
    for (let r = rg.r1 + 1; r <= rg.r2; r++) {
      const v = ev.value(si, r, col);
      const t = filterText(v, sheet.cells[key(r, col)]?.s);
      set.set(t, typeof v === "number" ? v : NaN);
    }
    return [...set.entries()]
      .sort((a, b) => {
        if (a[0] === "") return 1;
        if (b[0] === "") return -1;
        if (!Number.isNaN(a[1]) && !Number.isNaN(b[1])) return a[1] - b[1];
        return a[0].localeCompare(b[0], "es", { numeric: true, sensitivity: "base" });
      })
      .map(([t]) => t);
  }, [sheet, f, ev, si, col]);
  const [checked, setChecked] = useState<Set<string>>(() => new Set(f.show[col] ?? values));
  const [q, setQ] = useState("");
  const shown = values.filter((v) => !q || v.toLowerCase().includes(q.toLowerCase()));
  const allOn = shown.every((v) => checked.has(v));

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  const apply = () => {
    // Con una búsqueda, solo cuentan los valores que coinciden
    const sel = q ? shown.filter((v) => checked.has(v)) : values.filter((v) => checked.has(v));
    onApply(sel.length === values.length ? null : sel);
  };

  return createPortal(
    <div
      ref={ref}
      className="fixed z-[90] w-[260px] animate-pop-in rounded-[var(--radius)] border border-border bg-surface p-2 text-text shadow-soft"
      style={{ left: Math.min(x, window.innerWidth - 270), top: Math.min(y, window.innerHeight - 420) }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <button onClick={() => onSort(true)} className="flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-[13px] hover:bg-surface-2">
        <ArrowDownAZ className="size-4 text-muted" /> Ordenar de A a Z
      </button>
      <button onClick={() => onSort(false)} className="flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-[13px] hover:bg-surface-2">
        <ArrowDownZA className="size-4 text-muted" /> Ordenar de Z a A
      </button>
      <button
        onClick={() => onApply(null)}
        disabled={!f.show[col]}
        className="flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-[13px] hover:bg-surface-2 disabled:opacity-40"
      >
        <FilterX className="size-4 text-muted" /> Quitar el filtro de esta columna
      </button>
      <div className="my-1.5 h-px bg-border" />
      <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" className="mb-1.5 h-8" onKeyDown={(e) => e.key === "Enter" && apply()} />
      <div className="max-h-[200px] overflow-y-auto rounded-md border border-border py-1">
        <label className="flex cursor-pointer items-center gap-2 px-2 py-1 text-[12.5px] font-medium hover:bg-surface-2">
          <input
            type="checkbox"
            checked={allOn}
            onChange={() => {
              const next = new Set(checked);
              for (const v of shown) {
                if (allOn) next.delete(v);
                else next.add(v);
              }
              setChecked(next);
            }}
          />
          (Seleccionar todo)
        </label>
        {shown.map((v) => (
          <label key={v} className="flex cursor-pointer items-center gap-2 px-2 py-1 text-[12.5px] hover:bg-surface-2">
            <input
              type="checkbox"
              checked={checked.has(v)}
              onChange={() => {
                const next = new Set(checked);
                if (next.has(v)) next.delete(v);
                else next.add(v);
                setChecked(next);
              }}
            />
            <span className={cn("truncate", v === "" && "text-muted italic")}>{v === "" ? "(Vacías)" : v}</span>
          </label>
        ))}
      </div>
      <div className="mt-2 flex justify-end gap-1.5">
        <Button size="sm" variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button size="sm" variant="primary" onClick={apply} disabled={!values.some((v) => checked.has(v))}>Aceptar</Button>
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ */
/*  Reglas de formato condicional                                      */
/* ------------------------------------------------------------------ */

const NEEDS_A: CondType[] = ["gt", "lt", "between", "eq", "text", "top", "bottom"];

export function CondDialog({ type, range, onClose, onSave }: { type: CondType; range: Range; onClose: () => void; onSave: (r: CondRule) => void }) {
  const [a, setA] = useState(type === "top" || type === "bottom" ? "10" : "");
  const [b, setB] = useState("");
  const [preset, setPreset] = useState(type === "dup" || type === "belowAvg" || type === "bottom" || type === "lt" ? "red" : type === "unique" ? "yellow" : "green");
  const [rg, setRg] = useState(rangeToA1(range));
  const p = COND_PRESETS.find((x) => x.id === preset)!;
  const valid = !!parseRange(rg) && (!NEEDS_A.includes(type) || a.trim() !== "") && (type !== "between" || b.trim() !== "");
  const label: Record<string, string> = {
    gt: "Dar formato a las celdas MAYORES que",
    lt: "Dar formato a las celdas MENORES que",
    between: "Dar formato a las celdas ENTRE",
    eq: "Dar formato a las celdas IGUALES a",
    text: "Dar formato a las celdas que CONTIENEN",
    top: "Dar formato a los valores más altos (cantidad)",
    bottom: "Dar formato a los valores más bajos (cantidad)",
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={COND_LABELS[type]}
      description="La regla se aplica sola cada vez que cambian los datos."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            disabled={!valid}
            onClick={() => onSave({ id: uid(), type, range: rg.toUpperCase(), a: a || undefined, b: b || undefined, bg: p.bg, color: p.color })}
          >
            Aplicar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {NEEDS_A.includes(type) && (
          <label className="text-[12.5px] font-medium">
            {label[type]}
            <div className="mt-1 flex items-center gap-2">
              <Input autoFocus value={a} onChange={(e) => setA(e.target.value)} className="h-9 flex-1" placeholder={type === "text" ? "Texto" : "Valor"} />
              {type === "between" && (
                <>
                  <span className="text-muted">y</span>
                  <Input value={b} onChange={(e) => setB(e.target.value)} className="h-9 flex-1" placeholder="Valor" />
                </>
              )}
            </div>
          </label>
        )}
        <label className="text-[12.5px] font-medium">
          Con este formato
          <div className="mt-1 grid gap-1.5">
            {COND_PRESETS.map((x) => (
              <button
                key={x.id}
                onClick={() => setPreset(x.id)}
                className={cn("flex items-center gap-2.5 rounded-md border px-2.5 py-1.5 text-left text-[12.5px]", preset === x.id ? "border-accent" : "border-border hover:bg-surface-2")}
              >
                <span className="grid h-6 w-14 place-items-center rounded text-[11.5px] font-semibold" style={{ background: x.bg, color: x.color }}>
                  123
                </span>
                {x.label}
              </button>
            ))}
          </div>
        </label>
        <label className="text-[12.5px] font-medium">
          Se aplica a
          <Input value={rg} onChange={(e) => setRg(e.target.value)} className={cn("mt-1 h-9 font-mono", !parseRange(rg) && "border-red-400")} />
        </label>
      </div>
    </Dialog>
  );
}

export function CondManager({ rules, onClose, onDelete, onClear }: { rules: CondRule[]; onClose: () => void; onDelete: (id: string) => void; onClear: () => void }) {
  const describe = (r: CondRule) => {
    const base = COND_LABELS[r.type];
    if (r.type === "between") return `${base} ${r.a} y ${r.b}`;
    if (r.type === "text") return `${base} «${r.a}»`;
    if (r.a && NEEDS_A.includes(r.type)) return `${base} ${r.a}`;
    return base;
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Reglas de formato condicional"
      description="Reglas de esta hoja. Se aplican en orden; la última manda si dos coinciden."
      className="w-[min(94vw,560px)]"
      footer={
        <>
          <Button variant="ghost" className="mr-auto text-red-500" disabled={!rules.length} onClick={onClear}>Borrar todas</Button>
          <Button variant="primary" onClick={onClose}>Cerrar</Button>
        </>
      }
    >
      {!rules.length && <p className="py-6 text-center text-[13px] text-muted">Esta hoja no tiene reglas.</p>}
      <div className="flex flex-col gap-1.5">
        {rules.map((r) => (
          <div key={r.id} className="flex items-center gap-3 rounded-md border border-border px-3 py-2">
            <span
              className="h-6 w-10 shrink-0 rounded"
              style={{
                background: r.type === "scale" ? `linear-gradient(90deg, ${(r.colors ?? []).join(",")})` : r.type === "bars" ? `linear-gradient(90deg, ${r.colors?.[0]} 60%, transparent 60%)` : r.bg,
                border: "1px solid var(--border)",
              }}
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium">{describe(r)}</div>
              <div className="font-mono text-[11.5px] text-muted">{r.range}</div>
            </div>
            <button onClick={() => onDelete(r.id)} className="grid size-7 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-red-500" aria-label="Eliminar regla">
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Lista desplegable (validación de datos)                            */
/* ------------------------------------------------------------------ */

export function ValidationDialog({
  initial,
  range,
  onClose,
  onSave,
  onRemove,
}: {
  initial?: Validation;
  range: Range;
  onClose: () => void;
  onSave: (v: Validation) => void;
  onRemove: () => void;
}) {
  const [mode, setMode] = useState<"list" | "source">(initial?.source ? "source" : "list");
  const [items, setItems] = useState((initial?.list ?? []).join("\n"));
  const [source, setSource] = useState(initial?.source ?? "");
  const [strict, setStrict] = useState(initial?.strict ?? true);
  const [rg, setRg] = useState(initial?.range ?? rangeToA1(range));
  const list = items.split(/[\n;]/).map((x) => x.trim()).filter(Boolean);
  const valid = !!parseRange(rg) && (mode === "list" ? list.length > 0 : /^(.+!)?\$?[A-Za-z]+\$?\d+(:\$?[A-Za-z]+\$?\d+)?$/.test(source.replace(/^=/, "").trim()));
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Lista desplegable"
      description="Las celdas mostrarán una flecha para elegir un valor de la lista."
      footer={
        <>
          {initial && <Button variant="ghost" className="mr-auto text-red-500" onClick={onRemove}>Quitar la lista</Button>}
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            disabled={!valid}
            onClick={() =>
              onSave({
                id: initial?.id ?? uid(),
                range: rg.toUpperCase(),
                strict,
                ...(mode === "list" ? { list } : { source: source.replace(/^=/, "").trim().toUpperCase() }),
              })
            }
          >
            Aplicar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex gap-1.5">
          {(["list", "source"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={cn("flex-1 rounded-md border px-3 py-1.5 text-[12.5px]", mode === m ? "border-accent bg-accent-soft text-accent" : "border-border hover:bg-surface-2")}>
              {m === "list" ? "Escribir los valores" : "Tomarlos de un rango"}
            </button>
          ))}
        </div>
        {mode === "list" ? (
          <label className="text-[12.5px] font-medium">
            Valores (uno por línea)
            <textarea
              autoFocus
              value={items}
              onChange={(e) => setItems(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              rows={5}
              placeholder={"Pendiente\nEn curso\nTerminado"}
              className="mt-1 w-full resize-none rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent"
            />
          </label>
        ) : (
          <label className="text-[12.5px] font-medium">
            Rango con los valores
            <Input autoFocus value={source} onChange={(e) => setSource(e.target.value)} placeholder="Ej.: H2:H10 o Listas!A1:A20" className="mt-1 h-9 font-mono" />
          </label>
        )}
        <label className="text-[12.5px] font-medium">
          Celdas
          <Input value={rg} onChange={(e) => setRg(e.target.value)} className={cn("mt-1 h-9 font-mono", !parseRange(rg) && "border-red-400")} />
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-[12.5px]">
          <input type="checkbox" checked={strict} onChange={(e) => setStrict(e.target.checked)} />
          No permitir valores que no estén en la lista
        </label>
      </div>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Comentario de una celda                                            */
/* ------------------------------------------------------------------ */

export function NoteDialog({ cell, initial, onClose, onSave }: { cell: string; initial: string; onClose: () => void; onSave: (text: string | null) => void }) {
  const [text, setText] = useState(initial);
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={initial ? `Comentario de ${cell}` : `Nuevo comentario en ${cell}`}
      footer={
        <>
          {initial && <Button variant="ghost" className="mr-auto text-red-500" onClick={() => onSave(null)}>Eliminar</Button>}
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={() => onSave(text)} disabled={!text.trim()}>Guardar</Button>
        </>
      }
    >
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && text.trim()) onSave(text);
        }}
        rows={5}
        placeholder="Escribe una nota para esta celda…"
        className="w-full resize-none rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-[13.5px] outline-none focus:border-accent"
      />
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Tabla dinámica                                                     */
/* ------------------------------------------------------------------ */

export function PivotDialog({
  sheet,
  ev,
  si,
  initial,
  onClose,
  onCreate,
}: {
  sheet: Sheet;
  ev: Evaluator;
  si: number;
  initial: Range;
  onClose: () => void;
  onCreate: (spec: PivotSpec) => void;
}) {
  const [rgText, setRgText] = useState(rangeToA1(initial));
  const rg = parseRange(rgText);
  const headers = useMemo(() => {
    if (!rg) return [];
    const out: { c: number; label: string; numeric: boolean }[] = [];
    for (let c = rg.c1; c <= rg.c2; c++) {
      const label = formatValue(ev.value(si, rg.r1, c)) || `Columna ${colName(c)}`;
      let numeric = false;
      for (let r = rg.r1 + 1; r <= Math.min(rg.r2, rg.r1 + 20); r++) if (typeof ev.value(si, r, c) === "number") numeric = true;
      out.push({ c, label, numeric });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rgText, ev, si, sheet]);
  const firstText = headers.find((h) => !h.numeric) ?? headers[0];
  const firstNum = headers.find((h) => h.numeric) ?? headers[headers.length - 1];
  const [rows, setRows] = useState<number | null>(null);
  const [cols, setCols] = useState<number | null>(null);
  const [value, setValue] = useState<number | null>(null);
  const [fn, setFn] = useState<PivotFn>("SUMA");
  const rowsC = rows ?? firstText?.c ?? null;
  const valueC = value ?? firstNum?.c ?? null;
  const valid = !!rg && rg.r2 > rg.r1 && rowsC !== null && valueC !== null && cols !== rowsC;
  const select = "mt-1 h-9 w-full rounded-[var(--radius)] border border-border bg-surface px-2 text-[13px] outline-none focus:border-accent";
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Tabla dinámica"
      description="Resume los datos agrupándolos por una columna. Se crea en una hoja nueva y se actualiza sola si cambian los datos."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={!valid} onClick={() => onCreate({ sheet: si, range: rg!, rows: rowsC!, cols, value: valueC!, fn })}>
            Crear
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-2 text-[12.5px] font-medium">
          Datos (con encabezados en la primera fila)
          <Input value={rgText} onChange={(e) => setRgText(e.target.value.toUpperCase())} className={cn("mt-1 h-9 font-mono", !rg && "border-red-400")} />
        </label>
        <label className="text-[12.5px] font-medium">
          Agrupar filas por
          <select value={rowsC ?? ""} onChange={(e) => setRows(Number(e.target.value))} className={select}>
            {headers.map((h) => <option key={h.c} value={h.c}>{h.label}</option>)}
          </select>
        </label>
        <label className="text-[12.5px] font-medium">
          Columnas <span className="font-normal text-muted">(opcional)</span>
          <select value={cols ?? ""} onChange={(e) => setCols(e.target.value === "" ? null : Number(e.target.value))} className={select}>
            <option value="">(ninguna)</option>
            {headers.filter((h) => h.c !== rowsC).map((h) => <option key={h.c} value={h.c}>{h.label}</option>)}
          </select>
        </label>
        <label className="text-[12.5px] font-medium">
          Valores
          <select value={valueC ?? ""} onChange={(e) => setValue(Number(e.target.value))} className={select}>
            {headers.map((h) => <option key={h.c} value={h.c}>{h.label}</option>)}
          </select>
        </label>
        <label className="text-[12.5px] font-medium">
          Cálculo
          <select value={fn} onChange={(e) => setFn(e.target.value as PivotFn)} className={select}>
            {PIVOT_FNS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
        </label>
      </div>
    </Dialog>
  );
}
