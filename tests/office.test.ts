// @vitest-environment jsdom
// (jsdom lee bien los atributos con espacio de nombres de Word y PowerPoint)
import { describe, expect, it } from "vitest";
import { AlignmentType, Document, Footer, Header, HeadingLevel, Packer, PageNumber, Paragraph, Table, TableCell, TableRow, TextRun } from "docx";
import { readDocx } from "@/lib/docxImport";
import { buildPptx, readPptx } from "@/lib/slides/pptx";
import { animTimeline, newDeck, type Slide } from "@/lib/slides/model";
import { SLIDES_TEMPLATES, slidesTemplate } from "@/lib/slides/templates";
import { parseOutline } from "@/lib/slides/outline";
import { checkKey } from "@/lib/license";
import { pageTexts } from "@/lib/pageLayout";

describe("Word (.docx)", () => {
  it("conserva formato, listas, tablas, saltos y encabezado/pie", async () => {
    const doc = new Document({
      sections: [
        {
          headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun("Informe anual")] })] }) },
          footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun("Página "), new TextRun({ children: [PageNumber.CURRENT] })] })] }) },
          children: [
            new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Título")] }),
            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Rojo", color: "C00000", bold: true, size: 32 })] }),
            new Paragraph({ bullet: { level: 0 }, children: [new TextRun("Punto")] }),
            new Table({ rows: [new TableRow({ children: [new TableCell({ children: [new Paragraph("A")] }), new TableCell({ children: [new Paragraph("B")] })] })] }),
            new Paragraph({ pageBreakBefore: true, children: [new TextRun("Segunda")] }),
          ],
        },
      ],
    });
    const blob = await Packer.toBlob(doc);
    const { html, pageLayout } = await readDocx(await blob.arrayBuffer());
    expect(html).toContain("<h1>Título</h1>");
    expect(html).toContain("text-align:center");
    expect(html).toContain("color:#c00000");
    expect(html).toContain("<strong>");
    expect(html).toContain("<ul><li>");
    expect(html).toContain("<table>");
    expect(html).toContain("data-page-break");
    expect(pageLayout?.header.right).toBe("Informe anual");
    expect(pageLayout?.footer.center).toBe("Página {pagina}");
  });
  it("rellena los campos del encabezado y el pie", () => {
    const t = pageTexts({ header: { left: "{titulo}", center: "", right: "" }, footer: { left: "", center: "{pagina} / {paginas}", right: "" }, differentFirstPage: true, startNumber: 1 }, 1, 3, "Mi doc", "Ana");
    expect(t.header.left).toBe("Mi doc");
    expect(t.footer.center).toBe("2 / 3");
  });
});

describe("PowerPoint (.pptx)", () => {
  it("exporta y vuelve a abrir textos, formas, imágenes y notas", async () => {
    const { deck } = slidesTemplate("project").build();
    deck.slides[1].notes = "Notas de prueba";
    deck.slides[1].els.push({ id: "e", type: "shape", shape: "ellipse", x: 900, y: 400, w: 200, h: 200, fill: "#ff0000", html: "<p>Hola</p>", shadow: true });
    const bytes = await buildPptx(deck, "Prueba");
    const back = await readPptx(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    expect(back.slides).toHaveLength(5);
    expect(back.slides[1].notes).toBe("Notas de prueba");
    expect(back.slides[1].els.some((e) => e.shape === "ellipse" && e.fill === "#ff0000")).toBe(true);
    expect(back.slides[0].els.some((e) => (e.html ?? "").includes("Nombre del proyecto"))).toBe(true);
  });
  it("todas las plantillas se exportan", async () => {
    for (const t of SLIDES_TEMPLATES) expect((await buildPptx(t.build().deck, t.name)).length).toBeGreaterThan(1000);
  });
});

describe("animaciones", () => {
  it("cada clic abre un paso; «con» y «después» van en el mismo", () => {
    const slide: Slide = {
      id: "s",
      els: [
        { id: "a", type: "text", x: 0, y: 0, w: 10, h: 10, anim: "fade", animTrigger: "after" },
        { id: "b", type: "text", x: 0, y: 0, w: 10, h: 10, anim: "bounce", animTrigger: "click", animDur: 1 },
        { id: "c", type: "text", x: 0, y: 0, w: 10, h: 10, anim: "zoom", animTrigger: "after" },
        { id: "d", type: "text", x: 0, y: 0, w: 10, h: 10, anim: "spin", animTrigger: "click" },
        { id: "e", type: "text", x: 0, y: 0, w: 10, h: 10, anim: "flyLeft", animTrigger: "with" },
      ],
    };
    const { items, steps } = animTimeline(slide);
    expect(steps).toBe(2);
    expect(items.get("a")!.step).toBe(0);
    expect(items.get("b")!.step).toBe(1);
    expect(items.get("c")).toMatchObject({ step: 1, start: 1 });
    expect(items.get("e")).toMatchObject({ step: 2, start: items.get("d")!.start });
  });
  it("una diapositiva sin animaciones no tiene pasos", () => {
    expect(animTimeline(newDeck().slides[0]).steps).toBe(0);
  });
  it("lee el esquema de la IA", () => {
    const slides = parseOutline("# Energías renovables\nEl futuro\n## ¿Qué son?\n- Sol\n- Viento\n## Conclusión");
    expect(slides).toHaveLength(3);
    expect(slides[1].els.find((e) => e.role === "body")!.html).toBe("<ul><li>Sol</li><li>Viento</li></ul>");
  });
});

describe("licencias", () => {
  const good =
    "LUMEN1-eyJ2IjoxLCJuIjoiUHJ1ZWJhIiwiZSI6InBydWViYUBlamVtcGxvLmNvbSIsInAiOiJwZXJzb25hbCIsImQiOiIyMDI2LTEwLTI4In0.kHwNwLMwts3tCMzDCM0BW-p7ANaBmOkYAIZ8VOkQBGNczWa-5T7bA2etS-oQ75HOI7n-QCYUc10sKlAZ9Sp0Ag";
  it("acepta una clave firmada", async () => {
    expect(await checkKey(good)).toMatchObject({ info: { name: "Prueba", email: "prueba@ejemplo.com" } });
  });
  it("rechaza claves falsas o cambiadas", async () => {
    expect(await checkKey(good.replace("kHwN", "kHwM"))).toHaveProperty("error");
    expect(await checkKey(good.replace("UHJ1ZWJh", "UHJ1ZWJi"))).toHaveProperty("error");
    expect(await checkKey("hola")).toHaveProperty("error");
  });
});
