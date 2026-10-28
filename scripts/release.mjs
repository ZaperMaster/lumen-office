#!/usr/bin/env node
/*
 * Publica una versión nueva de Lumen Office en GitHub:
 *   1. Compila los instaladores firmados para las actualizaciones automáticas.
 *   2. Genera latest.json, que es lo que consultan las apps instaladas.
 *   3. Crea la Release con los instaladores y latest.json.
 *
 * Uso:
 *   npm run release -- --notes notas.md            publica la versión de package.json
 *   npm run release -- --notes notas.md --dry-run   compila y genera latest.json sin publicar
 *
 * Necesita la clave privada en %USERPROFILE%\.tauri\lumen-office.key (y su contraseña en
 * lumen-office.key.password), o las variables TAURI_SIGNING_PRIVATE_KEY(_PASSWORD).
 * La clave NUNCA debe subirse al repositorio.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const REPO = "ZaperMaster/lumen-office";
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const root = join(import.meta.dirname, "..");
const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const tag = `v${version}`;
const notesFile = option("--notes");
const dryRun = flag("--dry-run");

function fail(msg) {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
}

if (!notesFile || !existsSync(notesFile)) fail("Indica las notas de la versión: --notes notas.md");
// Sin la marca BOM que añaden algunos editores (p. ej. PowerShell)
const notes = readFileSync(notesFile, "utf8").replace(/^﻿/, "");

// Coherencia de versiones entre package.json, tauri.conf.json y Cargo.toml
const tauriConf = JSON.parse(readFileSync(join(root, "src-tauri", "tauri.conf.json"), "utf8"));
const cargo = readFileSync(join(root, "src-tauri", "Cargo.toml"), "utf8");
const cargoVersion = cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
if (tauriConf.version !== version || cargoVersion !== version) {
  fail(`Las versiones no coinciden: package.json ${version}, tauri.conf.json ${tauriConf.version}, Cargo.toml ${cargoVersion}`);
}

// Clave de firma
const env = { ...process.env };
if (!env.TAURI_SIGNING_PRIVATE_KEY) {
  const keyPath = join(homedir(), ".tauri", "lumen-office.key");
  if (!existsSync(keyPath)) fail(`No se encontró la clave de firma en ${keyPath}`);
  env.TAURI_SIGNING_PRIVATE_KEY = readFileSync(keyPath, "utf8");
  const pwdPath = `${keyPath}.password`;
  env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD = existsSync(pwdPath) ? readFileSync(pwdPath, "utf8").trim() : "";
}

if (!dryRun) {
  try {
    execFileSync("gh", ["release", "view", tag, "--repo", REPO], { stdio: "ignore" });
    fail(`La Release ${tag} ya existe. Sube la versión antes de publicar.`);
  } catch {
    /* no existe: correcto */
  }
}

console.log("▶ Generando los avisos de licencias de terceros…");
execFileSync(process.execPath, [join(root, "scripts", "notices.mjs")], { cwd: root, stdio: "inherit" });

console.log(`▶ Compilando Lumen Office ${version} con firma de actualizaciones…`);
// La firma de actualizaciones solo se activa aquí: las compilaciones normales no necesitan la clave
const updaterConf = join(tmpdir(), "lumen-updater.conf.json");
writeFileSync(updaterConf, JSON.stringify({ bundle: { createUpdaterArtifacts: true } }));
execFileSync("npm", ["run", "tauri", "build", "--", "--config", `"${updaterConf}"`], { cwd: root, env, stdio: "inherit", shell: true });

const bundle = join(root, "src-tauri", "target", "release", "bundle");
const setupName = `Lumen Office_${version}_x64-setup.exe`;
const msiName = `Lumen Office_${version}_x64_en-US.msi`;
const setup = join(bundle, "nsis", setupName);
const msi = join(bundle, "msi", msiName);
const sig = `${setup}.sig`;
for (const f of [setup, msi, sig]) if (!existsSync(f)) fail(`No se generó ${f}`);

// GitHub cambia los espacios de los nombres de archivo por puntos
const assetUrl = (name) => `https://github.com/${REPO}/releases/download/${tag}/${name.replaceAll(" ", ".")}`;
const latest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": { signature: readFileSync(sig, "utf8").trim(), url: assetUrl(setupName) },
  },
};
const latestPath = join(bundle, "latest.json");
writeFileSync(latestPath, JSON.stringify(latest, null, 2));
console.log(`✔ latest.json generado en ${latestPath}`);

if (dryRun) {
  console.log("ℹ Modo de prueba: no se publica nada.");
  process.exit(0);
}

console.log(`▶ Publicando la Release ${tag}…`);
execFileSync(
  "gh",
  ["release", "create", tag, setup, msi, latestPath, "--repo", REPO, "--target", "main", "--title", `Lumen Office ${tag}`, "--latest", "--notes-file", notesFile],
  { stdio: "inherit" },
);
console.log(`✔ Publicada: https://github.com/${REPO}/releases/tag/${tag}`);
