import { create } from "zustand";
import type { Update } from "@tauri-apps/plugin-updater";
import { isDesktop, flushOpenDocs } from "@/lib/files";
import { confirmClose } from "@/lib/closeGuard";

/*
 * Actualizaciones automáticas: la app consulta el latest.json de la última Release
 * de GitHub, descarga el instalador nuevo (firmado con nuestra clave) y lo instala.
 */

type Status = "idle" | "checking" | "available" | "downloading" | "installing" | "uptodate" | "error";

interface UpdaterState {
  status: Status;
  version: string | null;
  notes: string | null;
  /** Bytes descargados / total (0 si se desconoce) */
  progress: { done: number; total: number };
  error: string | null;
  /** El usuario pulsó «Más tarde»: no se vuelve a mostrar el aviso en esta sesión */
  dismissed: boolean;
  check: (opts?: { silent?: boolean }) => Promise<void>;
  install: () => Promise<void>;
  dismiss: () => void;
}

let pending: Update | null = null;

function friendly(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/404|not found/i.test(msg)) return "No se encontró información de actualizaciones (¿el repositorio es público?).";
  if (/signature/i.test(msg)) return "La actualización no tiene una firma válida y no se ha instalado.";
  if (/network|connect|dns|timed out|request/i.test(msg)) return "No se pudo conectar para buscar actualizaciones.";
  return `No se pudo comprobar si hay actualizaciones. ${msg}`;
}

export const useUpdater = create<UpdaterState>((set, get) => ({
  status: "idle",
  version: null,
  notes: null,
  progress: { done: 0, total: 0 },
  error: null,
  dismissed: false,

  check: async ({ silent = false } = {}) => {
    if (!isDesktop()) return;
    const busy = get().status;
    if (busy === "checking" || busy === "downloading" || busy === "installing") return;
    set({ status: "checking", error: null });
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (update) {
        pending = update;
        set({ status: "available", version: update.version, notes: update.body ?? null, dismissed: silent ? get().dismissed : false });
      } else {
        set({ status: "uptodate" });
      }
    } catch (e) {
      // En la comprobación automática al iniciar, un fallo no molesta al usuario
      set({ status: silent ? "idle" : "error", error: friendly(e) });
    }
  },

  install: async () => {
    if (!pending) return;
    // El instalador cierra la app: antes se guardan los documentos (o se pregunta)
    if (!(await confirmClose())) return;
    await flushOpenDocs();
    set({ status: "downloading", progress: { done: 0, total: 0 }, error: null });
    try {
      await pending.downloadAndInstall((event) => {
        if (event.event === "Started") set({ progress: { done: 0, total: event.data.contentLength ?? 0 } });
        else if (event.event === "Progress") set((s) => ({ progress: { ...s.progress, done: s.progress.done + event.data.chunkLength } }));
        else if (event.event === "Finished") set({ status: "installing" });
      });
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (e) {
      set({ status: "error", error: friendly(e) });
    }
  },

  dismiss: () => set({ dismissed: true }),
}));

/** Versión instalada de la app. */
export async function appVersion(): Promise<string> {
  if (isDesktop()) {
    const { getVersion } = await import("@tauri-apps/api/app");
    return getVersion();
  }
  return __APP_VERSION__;
}
