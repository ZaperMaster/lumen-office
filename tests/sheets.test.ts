import { describe, expect, it } from "vitest";
import * as ops from "@/lib/sheet/ops";
import { key, newWorkbook, type Workbook } from "@/lib/sheet/model";
import { Evaluator } from "@/lib/sheet/formula";
import { formatValue } from "@/lib/sheet/format";
import { buildPivot } from "@/lib/sheet/pivot";
import { SHEET_TEMPLATES, sheetTemplate } from "@/lib/sheet/templates";
import { buildCsv, buildXlsx, readCsv, readXlsx } from "@/lib/sheet/xlsx";
import { condFormatter, hiddenRows } from "@/lib/sheet/view";

const ab = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

describe("operaciones de hoja", () => {
  it("rellena series y fórmulas", () => {
    let wb = newWorkbook();
    wb = ops.inputCell(wb, 0, 0, 0, "1");
    wb = ops.inputCell(wb, 0, 1, 0, "2");
    wb = ops.inputCell(wb, 0, 0, 1, "Semana 1");
    wb = ops.inputCell(wb, 0, 0, 2, "=A1*10");
    wb = ops.fillRange(wb, 0, { r1: 0, c1: 0, r2: 1, c2: 0 }, { r1: 0, c1: 0, r2: 5, c2: 0 });
    wb = ops.fillRange(wb, 0, { r1: 0, c1: 1, r2: 0, c2: 2 }, { r1: 0, c1: 1, r2: 3, c2: 2 });
    const s = wb.sheets[0];
    expect([0, 1, 2, 3, 4, 5].map((r) => s.cells[key(r, 0)]?.v)).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(s.cells[key(3, 1)].v).toBe("Semana 4");
    expect(s.cells[key(3, 2)].v).toBe("=A4*10");
  });
  it("inserta y borra filas sin romper las fórmulas", () => {
    let wb = newWorkbook();
    for (let r = 0; r < 6; r++) wb = ops.inputCell(wb, 0, r, 0, String(r + 1));
    wb = ops.inputCell(wb, 0, 8, 0, "=SUMA(A1:A6)");
    wb = ops.insertLines(wb, 0, "row", 2, 2);
    expect(wb.sheets[0].cells[key(10, 0)].v).toBe("=SUMA(A1:A8)");
    expect(new Evaluator(wb).value(0, 10, 0)).toBe(21);
  });
  it("ordena con encabezado", () => {
    let wb = newWorkbook();
    [["Nombre", "Edad"], ["Luis", "30"], ["ana", "25"], ["Berta", "41"]].forEach((row, r) => row.forEach((v, c) => (wb = ops.inputCell(wb, 0, r, c, v))));
    wb = ops.sortRange(wb, 0, { r1: 0, c1: 0, r2: 3, c2: 1 }, 0, true, true);
    expect([0, 1, 2, 3].map((r) => wb.sheets[0].cells[key(r, 0)].v)).toEqual(["Nombre", "ana", "Berta", "Luis"]);
  });
  it("tabla dinámica con totales", () => {
    const { wb } = sheetTemplate("expenses").build();
    const out = buildPivot(wb, new Evaluator(wb), { sheet: 0, range: { r1: 0, c1: 0, r2: 6, c2: 3 }, rows: 2, cols: null, value: 3, fn: "SUMA" });
    const ev = new Evaluator(out);
    const s = out.sheets[out.active];
    const text = (r: number, c: number) => formatValue(ev.value(out.active, r, c), s.cells[key(r, c)]?.s);
    expect(text(3, 0)).toBe("Comida");
    expect(text(3, 1)).toBe("105,50 €");
    expect(text(6, 1)).toBe("255,00 €");
  });
  it("filtro y formato condicional", () => {
    let { wb } = sheetTemplate("grades").build();
    wb = ops.formatAsTable(wb, 0, { r1: 0, c1: 0, r2: 5, c2: 5 }, "blue");
    wb = ops.updateSheet(wb, 0, { filter: { ...wb.sheets[0].filter!, show: { 5: ["Aprobado"] } }, cond: [{ id: "1", type: "gt", range: "E2:E6", a: "7", bg: "#c6efce" }] });
    const ev = new Evaluator(wb);
    expect([...hiddenRows(wb.sheets[0], ev, 0)]).toEqual([4]);
    expect(condFormatter(wb.sheets[0], ev, 0)!(3, 4)?.bg).toBe("#c6efce");
  });
  it("todas las plantillas calculan sin errores", () => {
    for (const t of SHEET_TEMPLATES) {
      const { wb } = t.build();
      const ev = new Evaluator(wb);
      for (const k of Object.keys(wb.sheets[0].cells)) {
        const [r, c] = k.split(",").map(Number);
        const v = ev.value(0, r, c);
        expect(typeof v === "object" && v !== null, `${t.id} ${k}`).toBe(false);
      }
    }
  });
});

describe("Excel y CSV", () => {
  it("guarda y vuelve a abrir sin perder nada", async () => {
    let { wb } = sheetTemplate("budget").build();
    wb = ops.setNote(wb, 0, 3, 0, "Revisar");
    wb = ops.updateSheet(wb, 0, {
      validations: [{ id: "v", range: "A4:A11", list: ["Sí", "No"], strict: true }],
      cond: [{ id: "c", type: "scale", range: "B4:B11", colors: ["#f8696b", "#63be7b"] }],
    });
    const back = await readXlsx(ab(await buildXlsx(wb)));
    const a = new Evaluator(wb);
    const b = new Evaluator(back);
    for (const k of Object.keys(wb.sheets[0].cells)) {
      const [r, c] = k.split(",").map(Number);
      expect(String(b.value(0, r, c)), k).toBe(String(a.value(0, r, c)));
    }
    const s = back.sheets[0];
    expect(s.cells[key(3, 1)].s?.fmt).toBe("currency");
    expect(s.freezeR).toBe(3);
    expect(s.notes?.[key(3, 0)]).toBe("Revisar");
    expect(s.validations?.[0]).toMatchObject({ range: "A4:A11", list: ["Sí", "No"], strict: true });
    expect(s.cond?.[0]).toMatchObject({ type: "scale", range: "B4:B11" });
  });
  it("CSV con punto y coma y coma decimal", () => {
    const { wb } = sheetTemplate("grades").build();
    const csv = buildCsv(wb);
    expect(csv.split("\r\n")[1]).toContain("Ana García;7,5;8;9;8,");
    expect(readCsv(csv).sheets[0].cells[key(1, 1)].v).toBe("7.5");
  });
});

describe("gráficos y protección en Excel", () => {
  it("los gráficos se guardan en el .xlsx y se vuelven a leer", async () => {
    const { wb } = sheetTemplate("budget").build();
    const bytes = await buildXlsx(wb);
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(bytes);
    const chart = await zip.file("xl/charts/chart1.xml")!.async("string");
    expect(chart).toContain("<c:barChart>");
    expect(chart).toContain("'Presupuesto'!$B$4:$B$11");
    expect(await zip.file("xl/worksheets/sheet1.xml")!.async("string")).toContain('<drawing r:id="rIdLumenDrawing"/>');
    expect(await zip.file("[Content_Types].xml")!.async("string")).toContain("/xl/charts/chart1.xml");
    const back = await readXlsx(ab(bytes));
    expect(back.sheets[0].charts?.[0]).toMatchObject({ type: "column", title: "Previsto y real" });
    expect(back.sheets[0].charts?.[0].range).toBe("A3:C11");
  });
  it("la protección y las celdas desbloqueadas se conservan", async () => {
    let wb = newWorkbook();
    wb = ops.inputCell(wb, 0, 0, 0, "Fijo");
    wb = ops.styleRange(wb, 0, { r1: 1, c1: 0, r2: 1, c2: 0 }, { unlocked: true });
    wb = ops.updateSheet(wb, 0, { protected: true });
    const back = await readXlsx(ab(await buildXlsx(wb)));
    expect(back.sheets[0].protected).toBe(true);
    expect(back.sheets[0].cells[key(1, 0)]?.s?.unlocked).toBe(true);
  });
  it("con la hoja protegida no se cambian celdas bloqueadas", () => {
    let wb = newWorkbook();
    wb = ops.inputCell(wb, 0, 0, 0, "Fijo");
    wb = ops.styleRange(wb, 0, { r1: 1, c1: 0, r2: 1, c2: 0 }, { unlocked: true });
    wb = ops.updateSheet(wb, 0, { protected: true });
    expect(ops.touchesLocked(wb, ops.inputCell(wb, 0, 0, 0, "Otro"))).toBe(true);
    expect(ops.touchesLocked(wb, ops.inputCell(wb, 0, 1, 0, "Libre"))).toBe(false);
    expect(ops.touchesLocked(wb, ops.insertLines(wb, 0, "row", 0, 1))).toBe(true);
  });
});
