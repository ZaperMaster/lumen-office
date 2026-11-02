// Une las traducciones de un idioma en docs/lang/<código>.json (lo que descarga la app)
// y avisa de lo que falta por traducir.
//
//   node scripts/i18n-pack.mjs en traducciones-1.json traducciones-2.json …
//
// Cada archivo de entrada es { "texto en español": "traducción" }. Solo se guardan
// los textos que existen en la app (scripts/i18n/catalog.json) y cambian al traducirlos.
import { readFileSync, writeFileSync } from "node:fs";

const [code, ...inputs] = process.argv.slice(2);
if (!code || !inputs.length) {
  console.error("Uso: node scripts/i18n-pack.mjs <código> <traducciones.json>…");
  process.exit(1);
}
const all = Object.assign({}, ...inputs.map((f) => JSON.parse(readFileSync(f, "utf8"))));
const catalog = Object.keys(JSON.parse(readFileSync("scripts/i18n/catalog.json", "utf8")));
const pack = {};
for (const k of catalog) if (all[k] !== undefined && all[k] !== k) pack[k] = all[k];
writeFileSync(`docs/lang/${code}.json`, JSON.stringify(pack));

const missing = catalog.filter((k) => all[k] === undefined);
const marks = (s) => s.match(/\{\d+\}/g) ?? [];
const bad = Object.entries(pack).filter(([k, v]) => marks(v).some((m) => !marks(k).includes(m)));
console.log(`${code}: ${Object.keys(pack).length} traducidos · ${missing.length} sin traducir · ${bad.length} con marcadores mal`);
if (missing.length) console.log("Sin traducir (se verán en español):", JSON.stringify(missing));

// Tamaño en la lista de idiomas
const index = JSON.parse(readFileSync("docs/lang/index.json", "utf8"));
const kb = Math.ceil(Buffer.byteLength(JSON.stringify(pack)) / 1024);
const entry = index.languages.find((l) => l.code === code);
if (entry) entry.size = kb;
writeFileSync("docs/lang/index.json", JSON.stringify(index, null, 1) + "\n");
