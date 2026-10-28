import { useMemo } from "react";
import type { Evaluator } from "@/lib/sheet/formula";
import { formatValue } from "@/lib/sheet/format";
import { parseRange, type ChartSpec, type ChartType } from "@/lib/sheet/model";

/* Gráficos dibujados en SVG a partir de un rango de la hoja. */

export const CHART_TYPES: { id: ChartType; label: string }[] = [
  { id: "column", label: "Columnas" },
  { id: "bar", label: "Barras" },
  { id: "line", label: "Líneas" },
  { id: "area", label: "Área" },
  { id: "pie", label: "Circular" },
  { id: "doughnut", label: "Anillo" },
  { id: "scatter", label: "Dispersión" },
];

export const CHART_COLORS = ["#4f7cff", "#20b486", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];

export interface ChartData {
  categories: string[];
  series: { name: string; values: number[] }[];
}

/** Lee categorías y series de un rango: la primera columna de texto son las categorías y la primera fila, los nombres. */
export function chartData(spec: Pick<ChartSpec, "range" | "labels">, ev: Evaluator, sheet: number): ChartData {
  const rg = parseRange(spec.range);
  if (!rg) return { categories: [], series: [] };
  const grid: (string | number | null)[][] = [];
  for (let r = rg.r1; r <= rg.r2; r++) {
    const row: (string | number | null)[] = [];
    for (let c = rg.c1; c <= rg.c2; c++) {
      const v = ev.value(sheet, r, c);
      row.push(typeof v === "number" ? v : v === null ? null : formatValue(v));
    }
    grid.push(row);
  }
  if (!grid.length) return { categories: [], series: [] };
  const isText = (v: unknown) => typeof v === "string" && v !== "";
  const firstColText = grid[0].length > 1 && grid.slice(1).some((r) => isText(r[0]));
  const hasHeader = grid.length > 1 && grid[0].slice(firstColText ? 1 : 0).some(isText);
  const body = hasHeader ? grid.slice(1) : grid;
  const labelCol = !spec.labels && grid[0].length > 1 && body.some((r) => isText(r[0]));
  let categories: string[];
  if (spec.labels) {
    const lr = parseRange(spec.labels);
    categories = [];
    if (lr) for (let r = lr.r1; r <= lr.r2; r++) for (let c = lr.c1; c <= lr.c2; c++) categories.push(formatValue(ev.value(sheet, r, c)));
  } else categories = body.map((r, i) => (labelCol ? String(r[0] ?? "") : String(i + 1)));
  const first = labelCol ? 1 : 0;
  const series = [];
  for (let c = first; c < grid[0].length; c++) {
    series.push({
      name: hasHeader ? String(grid[0][c] ?? `Serie ${c - first + 1}`) : `Serie ${c - first + 1}`,
      values: body.map((r) => (typeof r[c] === "number" ? (r[c] as number) : 0)),
    });
  }
  return { categories, series };
}

function niceScale(min: number, max: number, ticks = 5) {
  if (min === max) {
    max = max === 0 ? 1 : max * 1.2;
    min = Math.min(0, min);
  }
  const span = max - min;
  const step0 = span / ticks;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? 10 * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Number(v.toPrecision(12)));
  return { lo, hi, ticks: out };
}

const short = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toLocaleString("es-ES", { maximumFractionDigits: 1 })} M`;
  if (a >= 1e4) return `${(n / 1e3).toLocaleString("es-ES", { maximumFractionDigits: 1 })} mil`;
  return n.toLocaleString("es-ES", { maximumFractionDigits: 2 });
};

export function ChartSvg({ type, data, width, height, title, legend = true }: { type: ChartType; data: ChartData; width: number; height: number; title?: string; legend?: boolean }) {
  const content = useMemo(() => {
    const { categories, series } = data;
    const titleH = title ? 30 : 8;
    const showLegend = legend && (series.length > 1 || type === "pie" || type === "doughnut");
    const legendH = showLegend ? 24 : 0;
    const W = width;
    const H = height;
    if (!series.length || !categories.length) {
      return (
        <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={13} fill="currentColor" opacity={0.5}>
          Selecciona un rango con números
        </text>
      );
    }

    const legendItems = type === "pie" || type === "doughnut" ? categories : series.map((s) => s.name);
    const legendEl = showLegend && (
      <g transform={`translate(0 ${H - 18})`}>
        {(() => {
          let x = 0;
          const items = legendItems.slice(0, 12).map((name, i) => {
            const w = Math.min(140, 22 + name.length * 6.6);
            const el = (
              <g key={i} transform={`translate(${x} 0)`}>
                <rect width={10} height={10} rx={2} y={-9} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                <text x={15} fontSize={11.5} fill="currentColor" opacity={0.8}>
                  {name.length > 20 ? name.slice(0, 19) + "…" : name}
                </text>
              </g>
            );
            x += w;
            return { el, w };
          });
          const total = items.reduce((s, i) => s + i.w, 0);
          return <g transform={`translate(${Math.max(8, (W - total) / 2)} 0)`}>{items.map((i) => i.el)}</g>;
        })()}
      </g>
    );

    if (type === "pie" || type === "doughnut") {
      const vals = series[0].values.map((v) => Math.max(0, v));
      const total = vals.reduce((a, b) => a + b, 0) || 1;
      const cx = W / 2;
      const cy = titleH + (H - titleH - legendH) / 2;
      const R = Math.max(10, Math.min(W, H - titleH - legendH) / 2 - 12);
      const r0 = type === "doughnut" ? R * 0.58 : 0;
      let a = -Math.PI / 2;
      const slices = vals.map((v, i) => {
        const da = (v / total) * Math.PI * 2;
        const a2 = a + da;
        const large = da > Math.PI ? 1 : 0;
        const p = (ang: number, rad: number) => `${cx + rad * Math.cos(ang)} ${cy + rad * Math.sin(ang)}`;
        const d =
          da >= Math.PI * 2 - 1e-6
            ? `M ${p(0, R)} A ${R} ${R} 0 1 1 ${p(Math.PI, R)} A ${R} ${R} 0 1 1 ${p(0, R)} Z`
            : r0
              ? `M ${p(a, R)} A ${R} ${R} 0 ${large} 1 ${p(a2, R)} L ${p(a2, r0)} A ${r0} ${r0} 0 ${large} 0 ${p(a, r0)} Z`
              : `M ${cx} ${cy} L ${p(a, R)} A ${R} ${R} 0 ${large} 1 ${p(a2, R)} Z`;
        const mid = a + da / 2;
        const lr = r0 ? (R + r0) / 2 : R * 0.65;
        const pct = v / total;
        const el = (
          <g key={i}>
            <path d={d} fill={CHART_COLORS[i % CHART_COLORS.length]} stroke="var(--chart-bg, #fff)" strokeWidth={1.5}>
              <title>{`${categories[i]}: ${short(v)} (${Math.round(pct * 100)} %)`}</title>
            </path>
            {pct > 0.05 && (
              <text x={cx + lr * Math.cos(mid)} y={cy + lr * Math.sin(mid) + 4} textAnchor="middle" fontSize={11.5} fontWeight={600} fill="#fff">
                {Math.round(pct * 100)} %
              </text>
            )}
          </g>
        );
        a = a2;
        return el;
      });
      return (
        <>
          {slices}
          {legendEl}
        </>
      );
    }

    const all = series.flatMap((s) => s.values);
    const horizontal = type === "bar";
    const scale = niceScale(Math.min(0, ...all), Math.max(0, ...all));
    const padL = horizontal ? Math.min(120, 12 + Math.max(...categories.map((c) => c.length)) * 6.5) : 46;
    const padR = 14;
    const top = titleH + 4;
    const bottom = H - legendH - (horizontal ? 22 : 26);
    const left = padL;
    const right = W - padR;
    const plotW = Math.max(10, right - left);
    const plotH = Math.max(10, bottom - top);
    const n = categories.length;
    const val = (v: number) => (v - scale.lo) / (scale.hi - scale.lo || 1);
    const els: React.ReactNode[] = [];

    // Rejilla y ejes
    scale.ticks.forEach((t, i) => {
      if (horizontal) {
        const x = left + val(t) * plotW;
        els.push(<line key={`g${i}`} x1={x} x2={x} y1={top} y2={bottom} stroke="currentColor" opacity={0.1} />);
        els.push(<text key={`t${i}`} x={x} y={bottom + 15} textAnchor="middle" fontSize={10.5} fill="currentColor" opacity={0.6}>{short(t)}</text>);
      } else {
        const y = bottom - val(t) * plotH;
        els.push(<line key={`g${i}`} x1={left} x2={right} y1={y} y2={y} stroke="currentColor" opacity={0.1} />);
        els.push(<text key={`t${i}`} x={left - 6} y={y + 3.5} textAnchor="end" fontSize={10.5} fill="currentColor" opacity={0.6}>{short(t)}</text>);
      }
    });

    const every = Math.ceil(n / Math.max(1, Math.floor((horizontal ? plotH : plotW) / (horizontal ? 16 : 60))));
    categories.forEach((c, i) => {
      if (i % every) return;
      const label = c.length > 14 ? c.slice(0, 13) + "…" : c;
      if (horizontal) {
        const y = top + ((i + 0.5) / n) * plotH;
        els.push(<text key={`c${i}`} x={left - 6} y={y + 4} textAnchor="end" fontSize={11} fill="currentColor" opacity={0.75}>{label}</text>);
      } else {
        const x = type === "column" ? left + ((i + 0.5) / n) * plotW : left + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
        els.push(<text key={`c${i}`} x={x} y={bottom + 16} textAnchor="middle" fontSize={11} fill="currentColor" opacity={0.75}>{label}</text>);
      }
    });

    if (type === "column" || type === "bar") {
      const band = (horizontal ? plotH : plotW) / n;
      const groupW = band * 0.72;
      const bw = groupW / series.length;
      const zero = val(0);
      series.forEach((s, si) =>
        s.values.forEach((v, i) => {
          const start = i * band + (band - groupW) / 2 + si * bw;
          const a = Math.min(zero, val(v));
          const b = Math.max(zero, val(v));
          const color = CHART_COLORS[si % CHART_COLORS.length];
          const tip = <title>{`${s.name} · ${categories[i]}: ${short(v)}`}</title>;
          els.push(
            horizontal ? (
              <rect key={`b${si}-${i}`} x={left + a * plotW} y={top + start} width={Math.max(0.5, (b - a) * plotW)} height={Math.max(1, bw - 2)} rx={2} fill={color}>{tip}</rect>
            ) : (
              <rect key={`b${si}-${i}`} x={left + start} y={bottom - b * plotH} width={Math.max(1, bw - 2)} height={Math.max(0.5, (b - a) * plotH)} rx={2} fill={color}>{tip}</rect>
            ),
          );
        }),
      );
    } else {
      const xAt = (i: number) => left + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
      series.forEach((s, si) => {
        const color = CHART_COLORS[si % CHART_COLORS.length];
        if (type === "scatter") {
          s.values.forEach((v, i) =>
            els.push(<circle key={`p${si}-${i}`} cx={xAt(i)} cy={bottom - val(v) * plotH} r={4} fill={color}><title>{`${categories[i]}: ${short(v)}`}</title></circle>),
          );
          return;
        }
        const pts = s.values.map((v, i) => `${xAt(i)},${bottom - val(v) * plotH}`);
        if (type === "area") {
          els.push(
            <polygon key={`a${si}`} points={`${xAt(0)},${bottom - val(0) * plotH} ${pts.join(" ")} ${xAt(n - 1)},${bottom - val(0) * plotH}`} fill={color} opacity={0.25} />,
          );
        }
        els.push(<polyline key={`l${si}`} points={pts.join(" ")} fill="none" stroke={color} strokeWidth={2.2} strokeLinejoin="round" />);
        if (n <= 40)
          s.values.forEach((v, i) =>
            els.push(<circle key={`d${si}-${i}`} cx={xAt(i)} cy={bottom - val(v) * plotH} r={3} fill={color}><title>{`${s.name} · ${categories[i]}: ${short(v)}`}</title></circle>),
          );
      });
    }
    els.push(
      horizontal ? (
        <line key="axis" x1={left + val(0) * plotW} x2={left + val(0) * plotW} y1={top} y2={bottom} stroke="currentColor" opacity={0.35} />
      ) : (
        <line key="axis" x1={left} x2={right} y1={bottom - val(0) * plotH} y2={bottom - val(0) * plotH} stroke="currentColor" opacity={0.35} />
      ),
    );
    return (
      <>
        {els}
        {legendEl}
      </>
    );
  }, [data, type, width, height, title, legend]);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block select-none">
      {title && (
        <text x={width / 2} y={21} textAnchor="middle" fontSize={14} fontWeight={600} fill="currentColor">
          {title}
        </text>
      )}
      {content}
    </svg>
  );
}
