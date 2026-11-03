import JSZip from "jszip";
import type { Evaluator } from "@/lib/sheet/formula";
import { formatValue } from "@/lib/sheet/format";
import { DEFAULT_COL_W, DEFAULT_ROW_H, addr, colName, parseRange, uid, type ChartSpec, type ChartType, type Range, type Sheet, type Workbook } from "@/lib/sheet/model";

/*
 * Gráficos dentro del archivo de Excel. La librería de Excel no los escribe,
 * así que se añaden al .xlsx sus piezas (dibujo + gráfico en DrawingML) y, al
 * abrirlo, se leen de vuelta.
 */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const quote = (name: string) => `'${name.replace(/'/g, "''")}'`;
const absRange = (sheet: string, r1: number, c1: number, r2: number, c2: number) =>
  `${quote(sheet)}!$${colName(c1)}$${r1 + 1}${r1 === r2 && c1 === c2 ? "" : `:$${colName(c2)}$${r2 + 1}`}`;

interface Series {
  name: { ref?: string; text: string };
  values: { ref: string; nums: number[] };
}
interface Plan {
  cats: { ref: string; texts: string[] } | null;
  series: Series[];
}

/** Las mismas reglas que el gráfico en pantalla: encabezados y columna de categorías. */
function plan(spec: ChartSpec, s: Sheet, si: number, ev: Evaluator): Plan | null {
  const rg = parseRange(spec.range);
  if (!rg) return null;
  const isText = (r: number, c: number) => {
    const v = ev.value(si, r, c);
    return typeof v === "string" && v !== "";
  };
  const cols = rg.c2 - rg.c1 + 1;
  let firstColText = false;
  if (cols > 1) for (let r = rg.r1 + 1; r <= rg.r2; r++) if (isText(r, rg.c1)) firstColText = true;
  let header = false;
  if (rg.r2 > rg.r1) for (let c = rg.c1 + (firstColText ? 1 : 0); c <= rg.c2; c++) if (isText(rg.r1, c)) header = true;
  const body = header ? rg.r1 + 1 : rg.r1;
  if (body > rg.r2) return null;
  const labelCol = !spec.labels && cols > 1 && firstColText;
  let cats: Plan["cats"] = null;
  const lr = spec.labels ? parseRange(spec.labels) : null;
  if (lr) {
    const texts: string[] = [];
    for (let r = lr.r1; r <= lr.r2; r++) for (let c = lr.c1; c <= lr.c2; c++) texts.push(formatValue(ev.value(si, r, c)));
    cats = { ref: absRange(s.name, lr.r1, lr.c1, lr.r2, lr.c2), texts };
  } else if (labelCol) {
    const texts: string[] = [];
    for (let r = body; r <= rg.r2; r++) texts.push(formatValue(ev.value(si, r, rg.c1)));
    cats = { ref: absRange(s.name, body, rg.c1, rg.r2, rg.c1), texts };
  }
  const series: Series[] = [];
  for (let c = rg.c1 + (labelCol ? 1 : 0); c <= rg.c2; c++) {
    const nums: number[] = [];
    for (let r = body; r <= rg.r2; r++) {
      const v = ev.value(si, r, c);
      nums.push(typeof v === "number" ? v : 0);
    }
    series.push({
      name: header ? { ref: absRange(s.name, rg.r1, c, rg.r1, c), text: formatValue(ev.value(si, rg.r1, c)) } : { text: `Serie ${series.length + 1}` },
      values: { ref: absRange(s.name, body, c, rg.r2, c), nums },
    });
  }
  return { cats, series };
}

const COLORS = ["4F7CFF", "20B486", "F59E0B", "EF4444", "8B5CF6", "06B6D4", "EC4899", "84CC16"];

function serXml(p: Plan, se: Series, i: number, type: ChartType): string {
  const tx = se.name.ref
    ? `<c:tx><c:strRef><c:f>${esc(se.name.ref)}</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${esc(se.name.text)}</c:v></c:pt></c:strCache></c:strRef></c:tx>`
    : `<c:tx><c:v>${esc(se.name.text)}</c:v></c:tx>`;
  const color = COLORS[i % COLORS.length];
  const sp =
    type === "line" || type === "scatter"
      ? `<c:spPr><a:ln w="28575"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:ln></c:spPr>`
      : type === "pie" || type === "doughnut"
        ? ""
        : `<c:spPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></c:spPr>`;
  const cat = p.cats
    ? `<c:${type === "scatter" ? "xVal" : "cat"}><c:strRef><c:f>${esc(p.cats.ref)}</c:f><c:strCache><c:ptCount val="${p.cats.texts.length}"/>${p.cats.texts.map((t, k) => `<c:pt idx="${k}"><c:v>${esc(t)}</c:v></c:pt>`).join("")}</c:strCache></c:strRef></c:${type === "scatter" ? "xVal" : "cat"}>`
    : "";
  const val = `<c:${type === "scatter" ? "yVal" : "val"}><c:numRef><c:f>${esc(se.values.ref)}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${se.values.nums.length}"/>${se.values.nums.map((n, k) => `<c:pt idx="${k}"><c:v>${n}</c:v></c:pt>`).join("")}</c:numCache></c:numRef></c:${type === "scatter" ? "yVal" : "val"}>`;
  const marker = type === "line" ? `<c:marker><c:symbol val="circle"/><c:size val="5"/></c:marker>` : type === "scatter" ? `<c:marker><c:symbol val="circle"/><c:size val="6"/></c:marker>` : "";
  const smooth = type === "line" || type === "scatter" ? `<c:smooth val="0"/>` : "";
  return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>${tx}${sp}${marker}${cat}${val}${smooth}</c:ser>`;
}

function chartXml(spec: ChartSpec, p: Plan): string {
  const t = spec.type;
  const sers = p.series.map((s, i) => serXml(p, s, i, t)).join("");
  const axes = `<c:axId val="111"/><c:axId val="222"/>`;
  let plot: string;
  if (t === "pie") plot = `<c:pieChart><c:varyColors val="1"/>${p.series.slice(0, 1).map((s) => serXml(p, s, 0, t)).join("")}<c:firstSliceAng val="0"/></c:pieChart>`;
  else if (t === "doughnut") plot = `<c:doughnutChart><c:varyColors val="1"/>${p.series.slice(0, 1).map((s) => serXml(p, s, 0, t)).join("")}<c:firstSliceAng val="0"/><c:holeSize val="55"/></c:doughnutChart>`;
  else if (t === "line") plot = `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${sers}<c:marker val="1"/>${axes}</c:lineChart>`;
  else if (t === "area") plot = `<c:areaChart><c:grouping val="standard"/><c:varyColors val="0"/>${sers}${axes}</c:areaChart>`;
  else if (t === "scatter") plot = `<c:scatterChart><c:scatterStyle val="lineMarker"/><c:varyColors val="0"/>${sers}${axes}</c:scatterChart>`;
  else plot = `<c:barChart><c:barDir val="${t === "bar" ? "bar" : "col"}"/><c:grouping val="clustered"/><c:varyColors val="0"/>${sers}<c:gapWidth val="80"/>${axes}</c:barChart>`;
  const round = t === "pie" || t === "doughnut";
  const axesXml = round
    ? ""
    : t === "scatter"
      ? `<c:valAx><c:axId val="111"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:numFmt formatCode="General" sourceLinked="1"/><c:tickLblPos val="nextTo"/><c:crossAx val="222"/><c:crosses val="autoZero"/></c:valAx><c:valAx><c:axId val="222"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:majorGridlines/><c:numFmt formatCode="General" sourceLinked="1"/><c:tickLblPos val="nextTo"/><c:crossAx val="111"/><c:crosses val="autoZero"/></c:valAx>`
      : `<c:catAx><c:axId val="111"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${t === "bar" ? "l" : "b"}"/><c:numFmt formatCode="General" sourceLinked="1"/><c:tickLblPos val="nextTo"/><c:crossAx val="222"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/></c:catAx><c:valAx><c:axId val="222"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${t === "bar" ? "b" : "l"}"/><c:majorGridlines/><c:numFmt formatCode="General" sourceLinked="1"/><c:tickLblPos val="nextTo"/><c:crossAx val="111"/><c:crosses val="autoZero"/></c:valAx>`;
  const title = spec.title
    ? `<c:title><c:tx><c:rich><a:bodyPr/><a:p><a:r><a:t>${esc(spec.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>`
    : `<c:autoTitleDeleted val="1"/>`;
  const legend = spec.legend !== false && (p.series.length > 1 || round) ? `<c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:roundedCorners val="0"/><c:chart>${title}<c:plotArea><c:layout/>${plot}${axesXml}</c:plotArea>${legend}<c:plotVisOnly val="1"/></c:chart></c:chartSpace>`;
}

/** Celda y desplazamiento (EMU) de una posición en píxeles. */
function anchorAt(s: Sheet, x: number, y: number) {
  let col = 0;
  let left = 0;
  while (col < 16000 && left + (s.colW[col] ?? DEFAULT_COL_W) <= x) left += s.colW[col++] ?? DEFAULT_COL_W;
  let row = 0;
  let top = 0;
  while (row < 1_000_000 && top + (s.rowH[row] ?? DEFAULT_ROW_H) <= y) top += s.rowH[row++] ?? DEFAULT_ROW_H;
  return { col, colOff: Math.round((x - left) * 9525), row, rowOff: Math.round((y - top) * 9525) };
}

const DRAWING_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing";
const CHART_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart";

/** Añade los gráficos de todas las hojas al .xlsx creado por la librería. */
export async function addChartsToXlsx(bytes: Uint8Array, wb: Workbook, ev: Evaluator): Promise<Uint8Array> {
  if (!wb.sheets.some((s) => s.charts?.length)) return bytes;
  const zip = await JSZip.loadAsync(bytes);
  let types = (await zip.file("[Content_Types].xml")!.async("string")) ?? "";
  let chartNo = 0;
  let drawingNo = 0;
  for (let si = 0; si < wb.sheets.length; si++) {
    const s = wb.sheets[si];
    if (!s.charts?.length) continue;
    const sheetPath = `xl/worksheets/sheet${si + 1}.xml`;
    let sheetXml = await zip.file(sheetPath)?.async("string");
    if (!sheetXml) continue;
    drawingNo++;
    const anchors: string[] = [];
    const drawingRels: string[] = [];
    s.charts.forEach((spec, k) => {
      const p = plan(spec, s, si, ev);
      if (!p || !p.series.length) return;
      chartNo++;
      zip.file(`xl/charts/chart${chartNo}.xml`, chartXml(spec, p));
      types = types.replace("</Types>", `<Override PartName="/xl/charts/chart${chartNo}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>`);
      const from = anchorAt(s, spec.x, spec.y);
      const to = anchorAt(s, spec.x + spec.w, spec.y + spec.h);
      const rid = `rId${k + 1}`;
      drawingRels.push(`<Relationship Id="${rid}" Type="${CHART_REL}" Target="../charts/chart${chartNo}.xml"/>`);
      anchors.push(
        `<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>${from.col}</xdr:col><xdr:colOff>${from.colOff}</xdr:colOff><xdr:row>${from.row}</xdr:row><xdr:rowOff>${from.rowOff}</xdr:rowOff></xdr:from><xdr:to><xdr:col>${to.col}</xdr:col><xdr:colOff>${to.colOff}</xdr:colOff><xdr:row>${to.row}</xdr:row><xdr:rowOff>${to.rowOff}</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${k + 2}" name="${esc(spec.title || `Gráfico ${k + 1}`)}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="${rid}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`,
      );
    });
    if (!anchors.length) continue;
    zip.file(
      `xl/drawings/drawing${drawingNo}.xml`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${anchors.join("")}</xdr:wsDr>`,
    );
    zip.file(
      `xl/drawings/_rels/drawing${drawingNo}.xml.rels`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${drawingRels.join("")}</Relationships>`,
    );
    types = types.replace("</Types>", `<Override PartName="/xl/drawings/drawing${drawingNo}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`);
    // Relación de la hoja con el dibujo
    const relsPath = `xl/worksheets/_rels/sheet${si + 1}.xml.rels`;
    const rel = `<Relationship Id="rIdLumenDrawing" Type="${DRAWING_REL}" Target="../drawings/drawing${drawingNo}.xml"/>`;
    const relsXml = await zip.file(relsPath)?.async("string");
    zip.file(
      relsPath,
      relsXml
        ? relsXml.replace("</Relationships>", `${rel}</Relationships>`)
        : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rel}</Relationships>`,
    );
    // <drawing> va antes de legacyDrawing, tableParts y extLst (orden del formato)
    if (!/xmlns:r=/.test(sheetXml.slice(0, 600))) sheetXml = sheetXml.replace("<worksheet ", `<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" `);
    const tag = `<drawing r:id="rIdLumenDrawing"/>`;
    const at = ["<legacyDrawing", "<legacyDrawingHF", "<picture", "<oleObjects", "<controls", "<webPublishItems", "<tableParts", "<extLst", "</worksheet>"]
      .map((t) => sheetXml!.indexOf(t))
      .filter((i) => i >= 0)
      .sort((a, b) => a - b)[0];
    sheetXml = sheetXml.slice(0, at) + tag + sheetXml.slice(at);
    zip.file(sheetPath, sheetXml);
  }
  zip.file("[Content_Types].xml", types);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

/* ------------------------------------------------------------------ */
/*  Leer los gráficos al abrir                                         */
/* ------------------------------------------------------------------ */

const CHART_TYPES: Record<string, ChartType> = {
  barChart: "column", bar3DChart: "column", lineChart: "line", line3DChart: "line", areaChart: "area", pieChart: "pie",
  pie3DChart: "pie", doughnutChart: "doughnut", scatterChart: "scatter",
};

async function relsOf(zip: JSZip, path: string): Promise<Record<string, string>> {
  const dir = path.slice(0, path.lastIndexOf("/"));
  const text = await zip.file(`${dir}/_rels/${path.slice(path.lastIndexOf("/") + 1)}.rels`)?.async("string");
  const out: Record<string, string> = {};
  if (!text) return out;
  for (const m of text.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /Id="([^"]+)"/.exec(m[0])?.[1];
    const target = /Target="([^"]+)"/.exec(m[0])?.[1];
    if (!id || !target) continue;
    const parts = (target.startsWith("/") ? target.slice(1) : `${dir}/${target}`).split("/");
    const norm: string[] = [];
    for (const p of parts) {
      if (p === "..") norm.pop();
      else if (p !== ".") norm.push(p);
    }
    out[id] = norm.join("/");
  }
  return out;
}

/** Quita la hoja y los $ de una referencia: 'Hoja 1'!$B$2:$B$7 → B2:B7 */
const plainRef = (f: string) => f.replace(/^.*!/, "").replace(/\$/g, "");

/** Gráficos de una hoja del .xlsx (posición y rango aproximados). */
export async function readSheetCharts(data: ArrayBuffer, sheetIndex: number, s: Sheet): Promise<ChartSpec[]> {
  const zip = await JSZip.loadAsync(data);
  const sheetPath = `xl/worksheets/sheet${sheetIndex + 1}.xml`;
  const sheetXml = await zip.file(sheetPath)?.async("string");
  const drawingId = sheetXml && /<drawing\b[^>]*r:id="([^"]+)"/.exec(sheetXml)?.[1];
  if (!drawingId) return [];
  const sheetRels = await relsOf(zip, sheetPath);
  const drawingPath = sheetRels[drawingId];
  const drawingXml = drawingPath && (await zip.file(drawingPath)?.async("string"));
  if (!drawingXml) return [];
  const drawingRels = await relsOf(zip, drawingPath);
  const out: ChartSpec[] = [];
  const px = (n: string | undefined) => Math.round(Number(n ?? 0) / 9525);
  const colX = (c: number) => {
    let x = 0;
    for (let i = 0; i < c; i++) x += s.colW[i] ?? DEFAULT_COL_W;
    return x;
  };
  const rowY = (r: number) => {
    let y = 0;
    for (let i = 0; i < r; i++) y += s.rowH[i] ?? DEFAULT_ROW_H;
    return y;
  };
  for (const anchor of drawingXml.matchAll(/<xdr:twoCellAnchor[\s\S]*?<\/xdr:twoCellAnchor>/g)) {
    const a = anchor[0];
    const rid = /<c:chart\b[^>]*r:id="([^"]+)"/.exec(a)?.[1];
    const chartPath = rid && drawingRels[rid];
    const chart = chartPath && (await zip.file(chartPath)?.async("string"));
    if (!chart) continue;
    const typeKey = Object.keys(CHART_TYPES).find((k) => chart.includes(`<c:${k}>`) || chart.includes(`<c:${k} `));
    if (!typeKey) continue;
    let type = CHART_TYPES[typeKey];
    if (type === "column" && /<c:barDir val="bar"/.test(chart)) type = "bar";
    const vals = [...chart.matchAll(/<c:(?:val|yVal)>\s*<c:numRef>\s*<c:f>([^<]+)<\/c:f>/g)].map((m) => parseRange(plainRef(m[1])));
    const cat = /<c:(?:cat|xVal)>\s*<c:(?:strRef|numRef)>\s*<c:f>([^<]+)<\/c:f>/.exec(chart)?.[1];
    const tx = /<c:tx>\s*<c:strRef>\s*<c:f>([^<]+)<\/c:f>/.exec(chart)?.[1];
    const ranges = vals.filter((r): r is Range => !!r);
    if (!ranges.length) continue;
    const catR = cat ? parseRange(plainRef(cat)) : null;
    const all = catR ? [...ranges, catR] : ranges;
    const r1 = Math.min(...all.map((r) => r.r1)) - (tx ? 1 : 0);
    const range = { r1: Math.max(0, r1), c1: Math.min(...all.map((r) => r.c1)), r2: Math.max(...all.map((r) => r.r2)), c2: Math.max(...all.map((r) => r.c2)) };
    const title = /<c:title>[\s\S]*?<a:t>([^<]*)<\/a:t>/.exec(chart)?.[1] ?? "";
    const num = (tag: string, part: string) => Number(new RegExp(`<xdr:${tag}>(\\d+)</xdr:${tag}>`).exec(part)?.[1] ?? 0);
    const from = /<xdr:from>[\s\S]*?<\/xdr:from>/.exec(a)?.[0] ?? "";
    const to = /<xdr:to>[\s\S]*?<\/xdr:to>/.exec(a)?.[0] ?? "";
    const x = colX(Number(num("col", from))) + px(/<xdr:colOff>(\d+)/.exec(from)?.[1]);
    const y = rowY(Number(num("row", from))) + px(/<xdr:rowOff>(\d+)/.exec(from)?.[1]);
    const x2 = colX(Number(num("col", to))) + px(/<xdr:colOff>(\d+)/.exec(to)?.[1]);
    const y2 = rowY(Number(num("row", to))) + px(/<xdr:rowOff>(\d+)/.exec(to)?.[1]);
    out.push({
      id: uid(),
      type,
      range: `${addr(range.r1, range.c1)}:${addr(range.r2, range.c2)}`,
      // «&amp;» al final para no descodificar dos veces («&amp;lt;» es «&lt;», no «<»)
      title: title.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&"),
      x,
      y,
      w: Math.max(200, x2 - x),
      h: Math.max(150, y2 - y),
      legend: /<c:legend>/.test(chart),
    });
  }
  return out;
}
