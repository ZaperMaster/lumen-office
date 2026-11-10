import { describe, expect, it } from "vitest";
import { layoutToHtml, type PdfPage, type PdfText } from "@/lib/pdfImport";

// Página A4 (595 × 842 puntos). y va de abajo arriba, como en PDF.
const t = (str: string, x: number, y: number, size = 11, bold = false): PdfText => ({ str, x, y, w: str.length * size * 0.5, size, bold });
const page = (items: PdfText[]): PdfPage => ({ width: 595, height: 842, items });

describe("PDF a documento", () => {
  const pages = [
    page([
      t("Informe anual", 230, 780, 22, true),
      t("La empresa creció un 18 % este año gracias a los nuevos", 72, 720),
      t("clientes y a la tienda online, que ya supone la mi-", 72, 706),
      t("tad de las ventas.", 72, 692),
      t("Objetivos", 72, 650, 14, true),
      t("•", 72, 620),
      t("Abrir dos tiendas", 86, 620),
      t("•", 72, 604),
      t("Lanzar la app móvil", 86, 604),
      t("1. Primer paso", 72, 570),
      t("2. Segundo paso", 72, 554),
      t("1", 295, 40),
    ]),
    page([t("Segunda página con más texto.", 72, 780), t("2", 295, 40)]),
  ];
  const html = layoutToHtml(pages);

  it("reconoce el título centrado y los subtítulos", () => {
    expect(html).toContain('<h1 style="text-align:center">Informe anual</h1>');
    expect(html).toMatch(/<h[23]>Objetivos<\/h[23]>/);
  });
  it("une las líneas de un párrafo y las palabras partidas con guion", () => {
    expect(html).toContain("<p>La empresa creció un 18 % este año gracias a los nuevos clientes y a la tienda online, que ya supone la mitad de las ventas.</p>");
  });
  it("convierte las viñetas y los números en listas", () => {
    expect(html).toContain("<ul><li><p>Abrir dos tiendas</p></li><li><p>Lanzar la app móvil</p></li></ul>");
    expect(html).toContain("<ol><li><p>Primer paso</p></li><li><p>Segundo paso</p></li></ol>");
  });
  it("quita los números de página", () => {
    expect(html).not.toMatch(/<p>\d<\/p>/);
    expect(html).toContain("<p>Segunda página con más texto.</p>");
  });
  it("las líneas sangradas seguidas son una lista aunque la viñeta sea un dibujo", () => {
    const h = layoutToHtml([
      page([t("Texto normal del documento que ocupa toda la línea hasta el margen.", 72, 700), t("Primer elemento", 102, 680), t("Segundo elemento", 102, 664), t("Más texto normal al final.", 72, 640)]),
    ]);
    expect(h).toContain("<ul><li><p>Primer elemento</p></li><li><p>Segundo elemento</p></li></ul>");
  });
  it("un párrafo con la primera línea sangrada no es una lista", () => {
    const h = layoutToHtml([page([t("Era una mañana fría de invierno y nadie quería salir de", 100, 700), t("casa, salvo el cartero, que llegó puntual como siempre.", 72, 686)])]);
    expect(h).toBe("<p>Era una mañana fría de invierno y nadie quería salir de casa, salvo el cartero, que llegó puntual como siempre.</p>");
  });
  it("un PDF sin texto (escaneado) no da contenido", () => {
    expect(layoutToHtml([page([])])).toBe("");
  });
});
