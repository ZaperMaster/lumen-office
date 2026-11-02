import { describe, expect, it } from "vitest";
import { Evaluator, FErr, adjustForInsert, renameSheetRefs, shiftFormula, toExcelFormula } from "@/lib/sheet/formula";
import { editText, formatValue, parseInput, parseNumber } from "@/lib/sheet/format";
import { key, newWorkbook, type Workbook } from "@/lib/sheet/model";

/** Libro con celdas por dirección A1 */
function book(cells: Record<string, string>): Workbook {
  const wb = newWorkbook();
  for (const [a, v] of Object.entries(cells)) {
    const m = /^([A-Z]+)(\d+)$/.exec(a)!;
    wb.sheets[0].cells[key(Number(m[2]) - 1, m[1].charCodeAt(0) - 65)] = { v };
  }
  return wb;
}
const val = (wb: Workbook, a: string) => {
  const m = /^([A-Z]+)(\d+)$/.exec(a)!;
  return new Evaluator(wb).value(0, Number(m[2]) - 1, m[1].charCodeAt(0) - 65);
};

describe("fórmulas", () => {
  const wb = book({
    A1: "10", A2: "20", A3: "30", B1: "manzana", B2: "pera", B3: "manzana",
    C1: "=SUMA(A1:A3)", C2: "=PROMEDIO(A1;A2;A3)", C3: '=SI(A1>5;"alto";"bajo")',
    D1: '=SUMAR.SI(B1:B3;"manzana";A1:A3)', D2: '=BUSCARV("pera";B1:C3;1;FALSO)', D3: "=A1/0",
    E1: "=E2", E2: "=E1", E3: '=2^3*2+1&"x"', F1: '=CONTAR.SI(A:A;">15")', F2: "=50%*A1",
    F3: '=TEXTO(1234,5;"#.##0,00")', G1: "=REDONDEAR(PI();2)", G2: "=Y(A1>1;A2>1)",
    G3: "=INDICE(A1:A3;COINCIDIR(30;A1:A3;0))", H1: "=FECHA(2026;10;28)", H2: "=AÑO(H1)",
    H3: '=MAX.SI.CONJUNTO(A1:A3;B1:B3;"manzana")', I1: "=SUM(A1:A3)*2", I2: '=SI.ERROR(A1/0;"error")',
  });
  it.each([
    ["C1", 60], ["C2", 20], ["C3", "alto"], ["D1", 40], ["D2", "pera"], ["E3", "17x"], ["F1", 2], ["F2", 5],
    ["F3", "1.234,50"], ["G1", 3.14], ["G2", true], ["G3", 30], ["H1", 46323], ["H2", 2026], ["H3", 30], ["I1", 120], ["I2", "error"],
  ])("%s", (a, expected) => expect(val(wb, a)).toEqual(expected));
  it("división por cero y referencias circulares", () => {
    expect((val(wb, "D3") as FErr).code).toBe("#DIV/0!");
    expect((val(wb, "E1") as FErr).code).toBe("#CIRC!");
  });
  it("desplaza referencias al copiar", () => {
    expect(shiftFormula("=A1+$B$2+C$3+Hoja2!D4", 2, 1)).toBe("=B3+$B$2+D$3+Hoja2!E6");
  });
  it("ajusta referencias al insertar y borrar filas", () => {
    expect(adjustForInsert("=SUM(A1:A10)+B5", "Hoja1", true, "row", 3, 2)).toBe("=SUM(A1:A12)+B7");
    expect(adjustForInsert("=SUM(A1:A10)+B5", "Hoja1", true, "row", 3, -3)).toBe("=SUM(A1:A7)+#REF!");
  });
  it("pasa a fórmulas de Excel y renombra hojas", () => {
    expect(toExcelFormula("=SI(A1>2;SUMA(B1:B3);1,5)")).toBe("IF(A1>2,SUM(B1:B3),1.5)");
    expect(renameSheetRefs("=Hoja1!A1+'Mi hoja'!B2", "Mi hoja", "Ventas")).toBe("=Hoja1!A1+Ventas!B2");
  });
});

describe("formatos de número", () => {
  it("lee lo que se escribe en español", () => {
    expect(parseNumber("1.234,5")).toBe(1234.5);
    expect(parseNumber("1.500")).toBe(1500);
    expect(parseInput("12,5%")).toEqual({ v: "0.125", fmt: "percent" });
    expect(parseInput("20 €")).toEqual({ v: "20", fmt: "currency" });
    expect(parseInput("28/10/2026").fmt).toBe("date");
    expect(parseInput("hola")).toEqual({ v: "hola" });
  });
  it("muestra los valores con formato", () => {
    expect(formatValue(1234.5, { fmt: "currency" })).toBe("1.234,50 €");
    expect(formatValue(0.125, { fmt: "percent", dec: 1 })).toBe("12,5 %");
    expect(formatValue(46323, { fmt: "date" })).toBe("28/10/2026");
    expect(editText("0.125", { fmt: "percent" })).toBe("12,5%");
  });
});
