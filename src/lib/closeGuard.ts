import { dirtyOpenDocs, fileName, flushOpenDocs, isDesktop } from "@/lib/files";
import { useConfirm } from "@/store/confirm";
import { useSettings } from "@/store/settings";

/**
 * Antes de cerrar la ventana, comprueba si hay documentos con cambios que no
 * están en su archivo del disco. Con autoguardado los guarda; si no (o si falla),
 * pregunta «Guardar / No guardar / Cancelar». Devuelve true si se puede cerrar.
 */
export async function confirmClose(): Promise<boolean> {
  let dirty = dirtyOpenDocs();
  if (!dirty.length) return true;
  if (useSettings.getState().fileAutoSave) {
    // Se confía en el resultado de cada guardado: el estado del documento aún no se ha
    // refrescado y volver a comprobarlo daría «cambios pendientes» por error
    const ok = await Promise.all(dirty.map((d) => d.save()));
    dirty = dirty.filter((_, i) => !ok[i]);
    if (!dirty.length) return true;
  }
  const choice = await useConfirm.getState().askUnsaved(dirty.map((d) => fileName(d.path()!)));
  if (choice === "cancel") return false;
  if (choice === "discard") return true;
  const results = await Promise.all(dirty.map((d) => d.save()));
  return results.every(Boolean);
}

/** Engancha la confirmación al cierre de la ventana. Devuelve la función para soltarla. */
export function installCloseGuard(): () => void {
  if (!isDesktop()) {
    // Navegador: el aviso estándar de «¿Salir del sitio?»
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyOpenDocs().length && !useSettings.getState().fileAutoSave) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }

  let unlisten: (() => void) | undefined;
  let closing = false;
  void import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
    const win = getCurrentWindow();
    unlisten = await win.onCloseRequested(async (event) => {
      // Siempre se toma el control: así da tiempo a terminar de guardar antes de cerrar
      event.preventDefault();
      if (closing) return;
      closing = true;
      try {
        if (await confirmClose()) {
          await flushOpenDocs();
          await win.destroy();
        }
      } finally {
        closing = false;
      }
    });
  });
  return () => unlisten?.();
}
