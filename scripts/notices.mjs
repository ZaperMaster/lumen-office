#!/usr/bin/env node
/*
 * Genera los avisos de licencias de terceros que exige la distribución de la app
 * (MIT, Apache-2.0, BSD, ISC, OFL… piden incluir su texto y avisos de copyright).
 *
 * Incluye solo lo que va dentro de la app:
 *  - npm: dependencias de producción (las de desarrollo no se distribuyen)
 *  - Rust: crates enlazados en Windows (sin dependencias de desarrollo ni de compilación)
 *
 * Salida:
 *  - THIRD_PARTY_NOTICES.md          en el repositorio
 *  - public/third-party-notices.txt   dentro de la app (Configuración → Acerca de)
 *
 * Uso: npm run notices
 */
import { execFileSync, execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const root = join(import.meta.dirname, "..");
const LICENSE_FILE = /^(licen[cs]e|copying|notice|copyright)([-._].*)?$/i;

/** Textos de licencia que hay en la carpeta de un paquete. */
function licenseTexts(dir) {
  let files = [];
  try {
    files = readdirSync(dir).filter((f) => LICENSE_FILE.test(f) && statSync(join(dir, f)).isFile());
  } catch {
    return [];
  }
  return files.sort().map((f) => readFileSync(join(dir, f), "utf8").replace(/\r\n/g, "\n").trim());
}

/* ---------------- npm ---------------- */
function npmPackages() {
  const out = execSync("npm ls --omit=dev --all --parseable", { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const seen = new Map();
  for (const dir of out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    if (dir === root || !existsSync(join(dir, "package.json"))) continue;
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    const key = `${pkg.name}@${pkg.version}`;
    if (seen.has(key)) continue;
    const license = typeof pkg.license === "string" ? pkg.license : pkg.license?.type ?? (pkg.licenses ?? []).map((l) => l.type).join(" OR ");
    seen.set(key, { name: pkg.name, version: pkg.version, license: license || "desconocida", source: "npm", texts: licenseTexts(dir) });
  }
  return [...seen.values()];
}

/* ---------------- Rust ---------------- */
function rustPackages() {
  const meta = JSON.parse(
    execFileSync(
      "cargo",
      ["metadata", "--format-version", "1", "--filter-platform", "x86_64-pc-windows-msvc", "--manifest-path", join(root, "src-tauri", "Cargo.toml")],
      { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
    ),
  );
  const byId = new Map(meta.packages.map((p) => [p.id, p]));
  const nodes = new Map(meta.resolve.nodes.map((n) => [n.id, n]));
  // Recorrido desde la app siguiendo solo dependencias normales (las que acaban en el ejecutable)
  const keep = new Set();
  const stack = [meta.resolve.root];
  while (stack.length) {
    const id = stack.pop();
    if (keep.has(id)) continue;
    keep.add(id);
    for (const dep of nodes.get(id)?.deps ?? []) {
      if (dep.dep_kinds.some((k) => k.kind === null)) stack.push(dep.pkg);
    }
  }
  keep.delete(meta.resolve.root);
  return [...keep].map((id) => {
    const p = byId.get(id);
    return { name: p.name, version: p.version, license: p.license ?? "desconocida", source: "crates.io", texts: licenseTexts(dirname(p.manifest_path)) };
  });
}

/* ---------------- Salida ---------------- */
const packages = [...npmPackages(), ...rustPackages()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));

// Se agrupan los paquetes que comparten exactamente el mismo texto de licencia
const groups = new Map();
for (const p of packages) {
  const text = p.texts.join("\n\n-----\n\n");
  const key = text || `__sin_texto__${p.license}`;
  if (!groups.has(key)) groups.set(key, { text, license: p.license, packages: [] });
  groups.get(key).packages.push(p);
}

const lines = [
  "# Avisos de licencias de terceros",
  "",
  "Lumen Office incluye software de terceros. A continuación se reproducen sus licencias y avisos de copyright,",
  "tal como exigen. Lumen Office en sí se distribuye bajo la licencia PolyForm Noncommercial 1.0.0 (archivo LICENSE).",
  "",
  `Paquetes incluidos: ${packages.length} (${packages.filter((p) => p.source === "npm").length} de npm, ${packages.filter((p) => p.source === "crates.io").length} de crates.io).`,
  "",
  "Los modelos de IA que se descargan desde la app no forman parte de este paquete: cada uno tiene su propia licencia,",
  "indicada en su página de Hugging Face.",
  "",
  "## Resumen",
  "",
  ...packages.map((p) => `- ${p.name} ${p.version} (${p.source}) — ${p.license}`),
  "",
];
let i = 0;
for (const g of groups.values()) {
  i += 1;
  lines.push("", "-".repeat(80), "", `## Licencia ${i}: ${g.license}`, "", "Usada por:", ...g.packages.map((p) => `- ${p.name} ${p.version}`), "");
  lines.push(g.text || `(El paquete no incluye archivo de licencia; se distribuye bajo los términos estándar de «${g.license}».)`);
}
const output = lines.join("\n") + "\n";

writeFileSync(join(root, "THIRD_PARTY_NOTICES.md"), output);
writeFileSync(join(root, "public", "third-party-notices.txt"), output);
const missing = packages.filter((p) => !p.texts.length);
console.log(`✔ Avisos generados: ${packages.length} paquetes, ${groups.size} textos de licencia distintos, ${(output.length / 1024).toFixed(0)} KB.`);
if (missing.length) console.log(`ℹ ${missing.length} paquetes sin archivo de licencia propio (se cita su licencia estándar).`);
