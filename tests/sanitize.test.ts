import { describe, expect, it } from "vitest";
import { decodeEntities, htmlText, stripTags } from "@/lib/slides/model";

// Casos de las alertas de Code scanning (CodeQL)
describe("texto plano de HTML", () => {
  it("quita todas las etiquetas, aunque estén anidadas para engañar", () => {
    expect(stripTags("<scr<b>ipt>alert(1)</scr</b>ipt>")).not.toMatch(/<|>/);
    expect(stripTags("hola <b>mundo</b>")).toBe("hola mundo");
  });
  it("no descodifica dos veces", () => {
    expect(decodeEntities("&amp;lt;b&amp;gt;")).toBe("&lt;b&gt;");
    expect(decodeEntities("Tom &amp; Jerry &lt;3")).toBe("Tom & Jerry <3");
  });
  it("convierte el HTML de una diapositiva en líneas de texto", () => {
    expect(htmlText("<ul><li>Uno</li><li>Dos &amp; tres</li></ul>")).toBe("Uno\nDos & tres");
    expect(htmlText("<p>Texto &amp;lt;literal&amp;gt;</p>")).toBe("Texto &lt;literal&gt;");
  });
});
