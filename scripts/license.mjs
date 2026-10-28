#!/usr/bin/env node
/*
 * Generador de claves de licencia de Lumen Office (solo para el autor).
 *
 *   node scripts/license.mjs init
 *       Crea el par de claves (una vez). La privada se guarda FUERA del proyecto,
 *       en %USERPROFILE%\.lumen\license-private.pem. Nunca la subas a GitHub.
 *
 *   node scripts/license.mjs crear --nombre "Ana García" --email ana@ejemplo.com [--plan personal|empresa] [--dias 365]
 *       Escribe en pantalla una clave para ese cliente.
 *
 *   node scripts/license.mjs comprobar <clave>
 *       Comprueba una clave con la clave pública.
 */
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const dir = join(homedir(), ".lumen");
const privPath = join(dir, "license-private.pem");
const b64u = (buf) => Buffer.from(buf).toString("base64url");

const [, , cmd, ...rest] = process.argv;
const arg = (name) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
};

function loadPrivate() {
  if (!existsSync(privPath)) {
    console.error(`No existe la clave privada (${privPath}). Ejecuta primero: node scripts/license.mjs init`);
    process.exit(1);
  }
  return createPrivateKey(readFileSync(privPath));
}

function publicHex(priv) {
  const der = createPublicKey(priv).export({ format: "der", type: "spki" });
  return Buffer.from(der).subarray(-32).toString("hex");
}

if (cmd === "init") {
  if (existsSync(privPath)) {
    console.log("Ya existe una clave privada; no se sobrescribe.");
  } else {
    mkdirSync(dir, { recursive: true });
    const { privateKey } = generateKeyPairSync("ed25519");
    writeFileSync(privPath, privateKey.export({ format: "pem", type: "pkcs8" }), { mode: 0o600 });
    console.log(`Clave privada guardada en ${privPath}`);
    console.log("¡Haz una copia en un lugar seguro! Sin ella no podrás crear más licencias.");
  }
  console.log(`Clave pública (va en src/lib/license.ts): ${publicHex(loadPrivate())}`);
} else if (cmd === "crear") {
  const name = arg("nombre");
  const email = arg("email");
  if (!name || !email) {
    console.error('Uso: node scripts/license.mjs crear --nombre "Nombre" --email correo@ejemplo.com [--plan personal|empresa] [--dias 365]');
    process.exit(1);
  }
  const plan = arg("plan") ?? "personal";
  const days = arg("dias") ? Number(arg("dias")) : null;
  const today = new Date();
  const payload = {
    v: 1,
    n: name,
    e: email,
    p: plan,
    d: today.toISOString().slice(0, 10),
    ...(days ? { x: new Date(today.getTime() + days * 86400000).toISOString().slice(0, 10) } : {}),
  };
  const msg = Buffer.from(JSON.stringify(payload), "utf8");
  const sig = sign(null, msg, loadPrivate());
  console.log(`\nLicencia para ${name} <${email}> (${plan}${days ? `, ${days} días` : ", sin caducidad"}):\n`);
  console.log(`LUMEN1-${b64u(msg)}.${b64u(sig)}\n`);
} else if (cmd === "comprobar") {
  const key = (rest[0] ?? "").trim();
  const m = /^LUMEN1-([\w-]+)\.([\w-]+)$/.exec(key);
  if (!m) {
    console.log("Formato no válido");
    process.exit(1);
  }
  const ok = verify(null, Buffer.from(m[1], "base64url"), createPublicKey(loadPrivate()), Buffer.from(m[2], "base64url"));
  console.log(ok ? `Válida: ${Buffer.from(m[1], "base64url").toString("utf8")}` : "NO válida");
} else {
  console.log("Comandos: init | crear --nombre … --email … [--plan …] [--dias …] | comprobar <clave>");
}
