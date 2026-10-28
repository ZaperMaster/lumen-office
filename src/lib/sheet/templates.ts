import { key, newWorkbook, type CellStyle, type Sheet, type Workbook } from "@/lib/sheet/model";

/* Plantillas de hojas de cálculo */

export interface SheetTemplate {
  id: string;
  name: string;
  description: string;
  /** Color de la miniatura */
  tint: string;
  build: () => { title: string; wb: Workbook };
}

const HEAD: CellStyle = { b: true, color: "#ffffff", bg: "#0f9d58", align: "center", bb: true };
const TOTAL: CellStyle = { b: true, bt: true, bg: "#e6f4ea" };
const EUR: CellStyle = { fmt: "currency" };

/** Rellena filas a partir de A1 (o de la fila indicada). */
function rows(s: Sheet, data: (string | number | null)[][], start = 0, style?: (r: number, c: number) => CellStyle | undefined) {
  data.forEach((row, r) =>
    row.forEach((v, c) => {
      if (v === null) return;
      const st = style?.(r, c);
      s.cells[key(start + r, c)] = st ? { v: String(v), s: { ...st } } : { v: String(v) };
    }),
  );
}

function setStyle(s: Sheet, r: number, c: number, st: CellStyle) {
  const k = key(r, c);
  s.cells[k] = { v: s.cells[k]?.v ?? "", s: { ...s.cells[k]?.s, ...st } };
}

export const SHEET_TEMPLATES: SheetTemplate[] = [
  {
    id: "blank",
    name: "Libro en blanco",
    description: "Empieza desde cero",
    tint: "#ffffff",
    build: () => ({ title: "", wb: newWorkbook() }),
  },
  {
    id: "budget",
    name: "Presupuesto mensual",
    description: "Ingresos, gastos y ahorro",
    tint: "#e6f4ea",
    build: () => {
      const wb = newWorkbook();
      const s = wb.sheets[0];
      s.name = "Presupuesto";
      s.colW = { 0: 200, 1: 120, 2: 120, 3: 120 };
      rows(s, [["Presupuesto mensual"]]);
      setStyle(s, 0, 0, { b: true, fs: 16, color: "#0f9d58" });
      rows(s, [["Concepto", "Previsto", "Real", "Diferencia"]], 2, () => HEAD);
      const items = [
        ["Nómina", 2200, 2200],
        ["Otros ingresos", 150, 210],
        ["Alquiler / hipoteca", -750, -750],
        ["Luz, agua y gas", -120, -134],
        ["Comida", -350, -372],
        ["Transporte", -90, -75],
        ["Ocio", -150, -190],
        ["Ahorro", -400, -400],
      ];
      items.forEach((it, i) => {
        const r = 3 + i;
        s.cells[key(r, 0)] = { v: String(it[0]) };
        s.cells[key(r, 1)] = { v: String(it[1]), s: EUR };
        s.cells[key(r, 2)] = { v: String(it[2]), s: EUR };
        s.cells[key(r, 3)] = { v: `=C${r + 1}-B${r + 1}`, s: EUR };
      });
      const t = 3 + items.length;
      s.cells[key(t, 0)] = { v: "Saldo", s: TOTAL };
      for (const c of [1, 2, 3]) {
        const L = "ABCD"[c];
        s.cells[key(t, c)] = { v: `=SUMA(${L}4:${L}${t})`, s: { ...TOTAL, ...EUR } };
      }
      s.freezeR = 3;
      s.charts = [{ id: "c1", type: "column", range: `A3:C${t}`, title: "Previsto y real", x: 560, y: 40, w: 460, h: 280, legend: true }];
      return { title: "Presupuesto mensual", wb };
    },
  },
  {
    id: "expenses",
    name: "Control de gastos",
    description: "Registro con categorías y totales",
    tint: "#fff4e5",
    build: () => {
      const wb = newWorkbook();
      const s = wb.sheets[0];
      s.name = "Gastos";
      s.colW = { 0: 110, 1: 240, 2: 140, 3: 110, 5: 150, 6: 110 };
      rows(s, [["Fecha", "Descripción", "Categoría", "Importe"]], 0, () => HEAD);
      const today = Math.floor((Date.now() - Date.UTC(1899, 11, 30)) / 86400000);
      const data: [number, string, string, number][] = [
        [today - 9, "Supermercado", "Comida", 64.3],
        [today - 7, "Gasolina", "Transporte", 55],
        [today - 6, "Cena con amigos", "Ocio", 38.5],
        [today - 4, "Supermercado", "Comida", 41.2],
        [today - 2, "Cine", "Ocio", 16],
        [today - 1, "Abono transporte", "Transporte", 40],
      ];
      data.forEach((d, i) => {
        s.cells[key(i + 1, 0)] = { v: String(d[0]), s: { fmt: "date" } };
        s.cells[key(i + 1, 1)] = { v: d[1] };
        s.cells[key(i + 1, 2)] = { v: d[2] };
        s.cells[key(i + 1, 3)] = { v: String(d[3]), s: EUR };
      });
      // Resumen por categoría
      s.cells[key(0, 5)] = { v: "Categoría", s: HEAD };
      s.cells[key(0, 6)] = { v: "Total", s: HEAD };
      ["Comida", "Transporte", "Ocio"].forEach((cat, i) => {
        s.cells[key(i + 1, 5)] = { v: cat };
        s.cells[key(i + 1, 6)] = { v: `=SUMAR.SI(C:C;F${i + 2};D:D)`, s: EUR };
      });
      s.cells[key(4, 5)] = { v: "Total", s: TOTAL };
      s.cells[key(4, 6)] = { v: "=SUMA(G2:G4)", s: { ...TOTAL, ...EUR } };
      s.freezeR = 1;
      s.charts = [{ id: "c1", type: "doughnut", range: "F1:G4", title: "Gasto por categoría", x: 820, y: 20, w: 340, h: 280, legend: true }];
      return { title: "Control de gastos", wb };
    },
  },
  {
    id: "invoice",
    name: "Factura",
    description: "Con IVA y total automático",
    tint: "#e8f0fe",
    build: () => {
      const wb = newWorkbook();
      const s = wb.sheets[0];
      s.name = "Factura";
      s.colW = { 0: 280, 1: 90, 2: 110, 3: 120 };
      s.showGrid = false;
      rows(s, [
        ["FACTURA", null, "Nº", "2026-001"],
        ["Tu empresa S.L.", null, "Fecha", null],
        ["Calle Ejemplo 1, Madrid", null, null, null],
        [null],
        ["Cliente:", null, null, null],
        ["Nombre del cliente", null, null, null],
      ]);
      setStyle(s, 0, 0, { b: true, fs: 20, color: "#1a73e8" });
      s.cells[key(1, 3)] = { v: "=HOY()", s: { fmt: "date" } };
      setStyle(s, 4, 0, { b: true });
      rows(s, [["Descripción", "Cantidad", "Precio", "Importe"]], 7, () => ({ ...HEAD, bg: "#1a73e8" }));
      const lines: [string, number, number][] = [
        ["Diseño de logotipo", 1, 350],
        ["Página web (horas)", 12, 45],
        ["Mantenimiento mensual", 3, 60],
      ];
      lines.forEach((l, i) => {
        const r = 8 + i;
        s.cells[key(r, 0)] = { v: l[0], s: { bb: true } };
        s.cells[key(r, 1)] = { v: String(l[1]), s: { align: "center", bb: true } };
        s.cells[key(r, 2)] = { v: String(l[2]), s: { ...EUR, bb: true } };
        s.cells[key(r, 3)] = { v: `=B${r + 1}*C${r + 1}`, s: { ...EUR, bb: true } };
      });
      const r = 8 + lines.length + 1;
      s.cells[key(r, 2)] = { v: "Base imponible", s: { align: "right" } };
      s.cells[key(r, 3)] = { v: `=SUMA(D9:D${8 + lines.length})`, s: EUR };
      s.cells[key(r + 1, 2)] = { v: "IVA (21 %)", s: { align: "right" } };
      s.cells[key(r + 1, 3)] = { v: `=D${r + 1}*21%`, s: EUR };
      s.cells[key(r + 2, 2)] = { v: "TOTAL", s: { align: "right", b: true } };
      s.cells[key(r + 2, 3)] = { v: `=D${r + 1}+D${r + 2}`, s: { ...EUR, b: true, bg: "#e8f0fe", bt: true } };
      return { title: "Factura", wb };
    },
  },
  {
    id: "grades",
    name: "Notas de clase",
    description: "Medias y aprobados automáticos",
    tint: "#f3e8fd",
    build: () => {
      const wb = newWorkbook();
      const s = wb.sheets[0];
      s.name = "Notas";
      s.colW = { 0: 180 };
      rows(s, [["Alumno", "Examen 1", "Examen 2", "Trabajo", "Media", "Resultado"]], 0, () => ({ ...HEAD, bg: "#9334e6" }));
      const names: [string, number, number, number][] = [
        ["Ana García", 7.5, 8, 9],
        ["Luis Pérez", 4, 5.5, 6],
        ["Marta Ruiz", 9, 9.5, 10],
        ["Jorge Díaz", 3.5, 4, 5],
        ["Sara López", 6, 7, 6.5],
      ];
      names.forEach((n, i) => {
        const r = i + 1;
        s.cells[key(r, 0)] = { v: n[0] };
        n.slice(1).forEach((x, j) => (s.cells[key(r, j + 1)] = { v: String(x), s: { fmt: "number", dec: 1 } }));
        s.cells[key(r, 4)] = { v: `=PROMEDIO(B${r + 1}:D${r + 1})`, s: { fmt: "number", dec: 2, b: true } };
        s.cells[key(r, 5)] = { v: `=SI(E${r + 1}>=5;"Aprobado";"Suspenso")`, s: { align: "center" } };
      });
      s.freezeR = 1;
      s.charts = [{ id: "c1", type: "bar", range: "E1:E6", labels: "A2:A6", title: "Media por alumno", x: 700, y: 20, w: 420, h: 260, legend: false }];
      return { title: "Notas de clase", wb };
    },
  },
  {
    id: "tasks",
    name: "Seguimiento de tareas",
    description: "Estados con lista desplegable y colores",
    tint: "#eef1ff",
    build: () => {
      const wb = newWorkbook();
      const s = wb.sheets[0];
      s.name = "Tareas";
      s.colW = { 0: 260, 1: 140, 2: 110, 3: 120, 4: 110 };
      const head = { ...HEAD, bg: "#4f5bd5" };
      rows(s, [["Tarea", "Responsable", "Prioridad", "Fecha límite", "Estado"]], 0, () => head);
      const today = Math.floor((Date.now() - Date.UTC(1899, 11, 30)) / 86400000);
      const data: [string, string, string, number, string][] = [
        ["Preparar presupuesto", "Ana", "Alta", today + 2, "En curso"],
        ["Revisar contrato", "Luis", "Media", today + 5, "Pendiente"],
        ["Enviar facturas", "Marta", "Alta", today - 1, "Hecho"],
        ["Actualizar web", "Jorge", "Baja", today + 10, "Pendiente"],
      ];
      data.forEach((d, i) => {
        s.cells[key(i + 1, 0)] = { v: d[0] };
        s.cells[key(i + 1, 1)] = { v: d[1] };
        s.cells[key(i + 1, 2)] = { v: d[2], s: { align: "center" } };
        s.cells[key(i + 1, 3)] = { v: String(d[3]), s: { fmt: "date" } };
        s.cells[key(i + 1, 4)] = { v: d[4], s: { align: "center" } };
      });
      s.validations = [
        { id: "v1", range: "C2:C200", list: ["Alta", "Media", "Baja"], strict: true },
        { id: "v2", range: "E2:E200", list: ["Pendiente", "En curso", "Hecho"], strict: true },
      ];
      s.cond = [
        { id: "c1", type: "text", range: "E2:E200", a: "Hecho", bg: "#c6efce", color: "#006100" },
        { id: "c2", type: "text", range: "E2:E200", a: "En curso", bg: "#ffeb9c", color: "#9c5700" },
        { id: "c3", type: "text", range: "C2:C200", a: "Alta", bg: "#ffc7ce", color: "#9c0006" },
      ];
      s.filter = { r1: 0, c1: 0, r2: 4, c2: 4, show: {} };
      s.freezeR = 1;
      return { title: "Seguimiento de tareas", wb };
    },
  },
  {
    id: "loan",
    name: "Calculadora de préstamo",
    description: "Cuota mensual y total de intereses",
    tint: "#e8f7f7",
    build: () => {
      const wb = newWorkbook();
      const s = wb.sheets[0];
      s.name = "Préstamo";
      s.colW = { 0: 220, 1: 140 };
      s.showGrid = false;
      rows(s, [["Calculadora de préstamo"]]);
      setStyle(s, 0, 0, { b: true, fs: 16, color: "#0b7a75" });
      const input = { bg: "#fff8dc", bb: true };
      const lines: [string, string, CellStyle][] = [
        ["Importe del préstamo", "150000", { ...input, fmt: "currency" }],
        ["Interés anual", "0.035", { ...input, fmt: "percent", dec: 2 }],
        ["Años", "25", { ...input, align: "right" }],
        ["", "", {}],
        ["Cuota mensual", "=-PAGO(B3/12;B4*12;B2)", { fmt: "currency", b: true, bg: "#d9f2f1" }],
        ["Total pagado", "=B6*B4*12", { fmt: "currency" }],
        ["Total de intereses", "=B7-B2", { fmt: "currency", color: "#b42318" }],
      ];
      lines.forEach(([label, v, st], i) => {
        if (label) s.cells[key(i + 1, 0)] = { v: label, s: i >= 4 ? { b: true } : undefined };
        if (v) s.cells[key(i + 1, 1)] = { v, s: st };
      });
      s.notes = { [key(1, 1)]: "Cambia las celdas amarillas y el resto se calcula solo." };
      return { title: "Calculadora de préstamo", wb };
    },
  },
  {
    id: "inventory",
    name: "Inventario",
    description: "Existencias, valor y avisos de stock",
    tint: "#fdf0e6",
    build: () => {
      const wb = newWorkbook();
      const s = wb.sheets[0];
      s.name = "Inventario";
      s.colW = { 0: 90, 1: 220, 2: 100, 3: 110, 4: 120, 5: 110 };
      const head = { ...HEAD, bg: "#c2410c" };
      rows(s, [["Código", "Producto", "Unidades", "Precio", "Valor", "Mínimo"]], 0, () => head);
      const data: [string, string, number, number, number][] = [
        ["P-001", "Cuaderno A4", 120, 2.5, 50],
        ["P-002", "Bolígrafo azul", 35, 0.8, 100],
        ["P-003", "Carpeta", 60, 3.2, 20],
        ["P-004", "Grapadora", 8, 9.9, 10],
      ];
      data.forEach((d, i) => {
        const r = i + 1;
        s.cells[key(r, 0)] = { v: d[0] };
        s.cells[key(r, 1)] = { v: d[1] };
        s.cells[key(r, 2)] = { v: String(d[2]) };
        s.cells[key(r, 3)] = { v: String(d[3]), s: EUR };
        s.cells[key(r, 4)] = { v: `=C${r + 1}*D${r + 1}`, s: EUR };
        s.cells[key(r, 5)] = { v: String(d[4]) };
      });
      s.cells[key(5, 3)] = { v: "Total", s: { ...TOTAL, align: "right" } };
      s.cells[key(5, 4)] = { v: "=SUMA(E2:E5)", s: { ...TOTAL, ...EUR } };
      s.cond = [{ id: "c1", type: "lt", range: "C2:C5", a: "20", bg: "#ffc7ce", color: "#9c0006" }];
      s.notes = { [key(0, 2)]: "Las unidades por debajo de 20 se marcan en rojo." };
      s.freezeR = 1;
      return { title: "Inventario", wb };
    },
  },
  {
    id: "schedule",
    name: "Horario semanal",
    description: "Clases o turnos de lunes a viernes",
    tint: "#f1f8ff",
    build: () => {
      const wb = newWorkbook();
      const s = wb.sheets[0];
      s.name = "Horario";
      s.colW = { 0: 80, 1: 130, 2: 130, 3: 130, 4: 130, 5: 130 };
      const head = { ...HEAD, bg: "#2563eb" };
      rows(s, [["Hora", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes"]], 0, () => head);
      ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "16:00", "17:00"].forEach((h, i) => {
        s.cells[key(i + 1, 0)] = { v: String((Number(h.slice(0, 2)) * 60) / 1440), s: { fmt: "time", b: true, bg: "#eff6ff", align: "center" } };
        for (let c = 1; c <= 5; c++) s.cells[key(i + 1, c)] = { v: "", s: { bb: true, br: true, align: "center" } };
      });
      s.cells[key(1, 1)].v = "Matemáticas";
      s.cells[key(2, 2)].v = "Lengua";
      s.cells[key(3, 3)].v = "Inglés";
      s.cells[key(4, 4)].v = "Reunión";
      s.freezeR = 1;
      return { title: "Horario semanal", wb };
    },
  },
  {
    id: "hours",
    name: "Registro de horas",
    description: "Horas trabajadas y total a cobrar",
    tint: "#f5f0ff",
    build: () => {
      const wb = newWorkbook();
      const s = wb.sheets[0];
      s.name = "Horas";
      s.colW = { 0: 110, 1: 90, 2: 90, 3: 90, 4: 220 };
      const head = { ...HEAD, bg: "#7c3aed" };
      rows(s, [["Fecha", "Entrada", "Salida", "Horas", "Tarea"]], 0, () => head);
      const today = Math.floor((Date.now() - Date.UTC(1899, 11, 30)) / 86400000);
      [[9, 14, "Diseño"], [9, 17, "Reuniones y desarrollo"], [10, 13, "Revisión"]].forEach(([a, b, task], i) => {
        const r = i + 1;
        s.cells[key(r, 0)] = { v: String(today - 2 + i), s: { fmt: "date" } };
        s.cells[key(r, 1)] = { v: String((Number(a) * 60) / 1440), s: { fmt: "time" } };
        s.cells[key(r, 2)] = { v: String((Number(b) * 60) / 1440), s: { fmt: "time" } };
        s.cells[key(r, 3)] = { v: `=(C${r + 1}-B${r + 1})*24`, s: { fmt: "number", dec: 2 } };
        s.cells[key(r, 4)] = { v: String(task) };
      });
      s.cells[key(5, 2)] = { v: "Total horas", s: { ...TOTAL, align: "right" } };
      s.cells[key(5, 3)] = { v: "=SUMA(D2:D5)", s: { ...TOTAL, fmt: "number", dec: 2 } };
      s.cells[key(6, 2)] = { v: "Precio/hora", s: { align: "right" } };
      s.cells[key(6, 3)] = { v: "35", s: { ...EUR, bg: "#fff8dc" } };
      s.cells[key(7, 2)] = { v: "A cobrar", s: { b: true, align: "right" } };
      s.cells[key(7, 3)] = { v: "=D6*D7", s: { ...EUR, b: true, bg: "#ede9fe" } };
      s.freezeR = 1;
      return { title: "Registro de horas", wb };
    },
  },
];

export function sheetTemplate(id: string): SheetTemplate {
  return SHEET_TEMPLATES.find((t) => t.id === id) ?? SHEET_TEMPLATES[0];
}
