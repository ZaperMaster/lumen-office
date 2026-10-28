import { create } from "zustand";
import { verifyAsync } from "@noble/ed25519";
import { db } from "@/lib/db";

/*
 * Licencia y periodo de prueba.
 *
 * Las claves las firma el autor con su clave privada (scripts/license.mjs); la
 * app solo tiene la clave pública, así que puede comprobarlas sin conexión pero
 * no fabricarlas. La prueba dura TRIAL_DAYS desde el primer arranque.
 */

/** Clave pública de las licencias (la privada no está en el proyecto). */
const PUBLIC_KEY = "c159c42ffac7fe3eabef9e3d118091017240402e62da566490f8ee4c3f4c88d8";
export const TRIAL_DAYS = 14;
/** Dónde comprar una licencia (vacío: se muestra cómo contactar con el autor). */
export const BUY_URL = "";
export const CONTACT_URL = "https://github.com/ZaperMaster/lumen-office";

const DAY = 86400000;
const LS_KEY = "lumen.license";

export interface LicenseInfo {
  name: string;
  email: string;
  plan: string;
  issued: string;
  expires?: string;
}

export type LicenseStatus = "loading" | "trial" | "expired" | "licensed";

interface LicenseState {
  status: LicenseStatus;
  daysLeft: number;
  info: LicenseInfo | null;
  key: string | null;
}

export const useLicense = create<LicenseState>(() => ({ status: "loading", daysLeft: TRIAL_DAYS, info: null, key: null }));

const hexToBytes = (hex: string) => new Uint8Array(hex.match(/../g)!.map((h) => parseInt(h, 16)));
function b64uToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** Comprueba una clave. Devuelve sus datos o un mensaje de error. */
export async function checkKey(raw: string): Promise<{ info: LicenseInfo } | { error: string }> {
  const key = raw.replace(/\s+/g, "");
  const m = /^LUMEN1-([\w-]+)\.([\w-]+)$/.exec(key);
  if (!m) return { error: "La clave no tiene el formato correcto. Debe empezar por «LUMEN1-»." };
  let ok = false;
  try {
    ok = await verifyAsync(b64uToBytes(m[2]), b64uToBytes(m[1]), hexToBytes(PUBLIC_KEY));
  } catch {
    ok = false;
  }
  if (!ok) return { error: "La clave no es válida. Comprueba que la has copiado entera." };
  const p = JSON.parse(new TextDecoder().decode(b64uToBytes(m[1]))) as { n: string; e: string; p: string; d: string; x?: string };
  const info: LicenseInfo = { name: p.n, email: p.e, plan: p.p, issued: p.d, expires: p.x };
  if (info.expires && new Date(info.expires + "T23:59:59").getTime() < Date.now()) return { error: `Esta licencia caducó el ${new Date(info.expires).toLocaleDateString("es-ES")}.` };
  return { info };
}

interface Stored {
  trialStart?: number;
  lastSeen?: number;
  key?: string;
}

function readLocal(): Stored {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? "{}") as Stored;
  } catch {
    return {};
  }
}

async function readAll(): Promise<Stored> {
  const local = readLocal();
  let inDb: Stored = {};
  try {
    inDb = ((await db.meta.get("license"))?.value as Stored) ?? {};
  } catch {
    // Sin base de datos: solo lo local
  }
  // Se queda con el inicio de prueba más antiguo y la última fecha vista más reciente
  const starts = [local.trialStart, inDb.trialStart].filter((x): x is number => !!x);
  const seen = [local.lastSeen, inDb.lastSeen].filter((x): x is number => !!x);
  return {
    trialStart: starts.length ? Math.min(...starts) : undefined,
    lastSeen: seen.length ? Math.max(...seen) : undefined,
    key: local.key ?? inDb.key,
  };
}

async function writeAll(s: Stored) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch {
    // Sin almacenamiento local
  }
  try {
    await db.meta.put({ key: "license", value: s });
  } catch {
    // Sin base de datos
  }
}

/** Calcula el estado al arrancar (y tras activar o quitar la licencia). */
export async function refreshLicense() {
  const now = Date.now();
  const s = await readAll();
  if (!s.trialStart) s.trialStart = now;
  // Si el reloj va hacia atrás más de un día, no se alarga la prueba
  const clockBack = !!s.lastSeen && now < s.lastSeen - DAY;
  s.lastSeen = Math.max(s.lastSeen ?? 0, now);
  await writeAll(s);

  if (s.key) {
    const r = await checkKey(s.key);
    if ("info" in r) {
      useLicense.setState({ status: "licensed", info: r.info, key: s.key, daysLeft: 0 });
      return;
    }
  }
  const used = Math.floor((s.lastSeen - s.trialStart) / DAY);
  const daysLeft = clockBack ? 0 : Math.max(0, TRIAL_DAYS - used);
  useLicense.setState({ status: daysLeft > 0 ? "trial" : "expired", daysLeft, info: null, key: null });
}

/** Guarda una clave válida y activa la licencia. */
export async function activate(raw: string): Promise<{ ok: true; info: LicenseInfo } | { ok: false; error: string }> {
  const r = await checkKey(raw);
  if ("error" in r) return { ok: false, error: r.error };
  const s = await readAll();
  await writeAll({ ...s, key: raw.replace(/\s+/g, "") });
  await refreshLicense();
  return { ok: true, info: r.info };
}

/** Quita la licencia de este equipo (por ejemplo, para pasarla a otro). */
export async function deactivate() {
  const s = await readAll();
  delete s.key;
  await writeAll(s);
  await refreshLicense();
}
