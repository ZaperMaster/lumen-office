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
  it("rehace las tablas: columnas, encabezado, números alineados a la derecha y celdas de varias líneas", () => {
    const h = layoutToHtml([
      page([
        t("Ventas por zona", 72, 760, 11),
        t("Zona", 72, 730, 11, true),
        t("Responsable", 200, 730, 11, true),
        t("Ventas", 420, 730, 11, true),
        t("Norte", 72, 712),
        t("Ana García", 200, 712),
        t("92.400 €", 440, 712),
        t("Centro", 72, 694),
        t("Luis Pérez y", 200, 694),
        t("71.800 €", 440, 694),
        t("Marta Ruiz", 200, 680),
        t("Sur", 72, 662),
        t("Eva Gil", 200, 662),
        t("9.100 €", 446, 662),
        t("Texto normal después de la tabla.", 72, 620),
      ]),
    ]);
    expect(h).toContain(
      "<table><tbody><tr><th><p>Zona</p></th><th><p>Responsable</p></th><th><p>Ventas</p></th></tr>" +
        "<tr><td><p>Norte</p></td><td><p>Ana García</p></td><td><p>92.400 €</p></td></tr>" +
        "<tr><td><p>Centro</p></td><td><p>Luis Pérez y Marta Ruiz</p></td><td><p>71.800 €</p></td></tr>" +
        "<tr><td><p>Sur</p></td><td><p>Eva Gil</p></td><td><p>9.100 €</p></td></tr></tbody></table>",
    );
    expect(h).toContain("<p>Texto normal después de la tabla.</p>");
  });
  it("marca la cursiva", () => {
    const h = layoutToHtml([page([t("Una palabra ", 72, 700), { ...t("importante", 132, 700), italic: true }, t(" aquí.", 186, 700)])]);
    expect(h).toContain("<em>importante</em>");
  });
  it("coloca las imágenes en su sitio, entre el texto", () => {
    const h = layoutToHtml([
      { ...page([t("Antes de la imagen.", 72, 760), t("Después de la imagen.", 72, 500)]), images: [{ x: 72, y: 540, w: 300, h: 200, src: "data:image/png;base64,AAAA" }] },
    ]);
    expect(h).toBe('<p>Antes de la imagen.</p><img src="data:image/png;base64,AAAA" width="400" data-align="center"><p>Después de la imagen.</p>');
  });
  it("un PDF sin texto (escaneado) no da contenido", () => {
    expect(layoutToHtml([page([])])).toBe("");
  });
});
