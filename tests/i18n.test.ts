import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { L } from "@/lib/i18n";

const catalog = Object.keys(JSON.parse(readFileSync("scripts/i18n/catalog.json", "utf8")));
const packs = readdirSync("docs/lang").filter((f) => f.endsWith(".json") && f !== "index.json");
const marks = (s: string) => s.match(/\{\d+\}/g) ?? [];

describe("idiomas", () => {
  it("rellena los marcadores y devuelve el original si no hay traducción", () => {
    expect(L("Diapositiva {0}", 3)).toBe("Diapositiva 3");
    expect(L("{0} de {1} palabras", 2, 10)).toBe("2 de 10 palabras");
  });
  it("cada paquete está en la lista de idiomas", () => {
    const index = JSON.parse(readFileSync("docs/lang/index.json", "utf8")) as { languages: { code: string }[] };
    expect(packs.map((p) => p.replace(".json", "")).sort()).toEqual(index.languages.map((l) => l.code).sort());
  });
  for (const file of packs) {
    it(`el paquete ${file} solo traduce textos que existen y conserva los marcadores`, () => {
      const pack = JSON.parse(readFileSync(`docs/lang/${file}`, "utf8")) as Record<string, string>;
      for (const [k, v] of Object.entries(pack)) {
        expect(catalog, `«${k}» ya no está en la app`).toContain(k);
        for (const m of marks(v)) expect(marks(k), `«${k}» → «${v}»`).toContain(m);
      }
    });
  }
});
