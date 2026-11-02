import { db } from "@/lib/db";
import { isDesktop, revealInFolder } from "@/lib/files";
import { useApp } from "@/store/app";

import { L } from "@/lib/i18n";
/**
 * Copia de seguridad de todos los documentos, hojas, presentaciones y notas.
 * En la app de escritorio pregunta dónde guardarla; en el navegador, se descarga.
 */
export async function exportBackup(): Promise<void> {
  const docs = await db.docs.toArray();
  const json = JSON.stringify({ app: "lumen", version: 1, exportedAt: new Date().toISOString(), docs }, null, 2);
  const name = `lumen-copia-${new Date().toISOString().slice(0, 10)}.json`;
  const { toast } = useApp.getState();
  if (isDesktop()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const path = await save({ title: L("Guardar copia de seguridad"), defaultPath: name, filters: [{ name: L("Copia de seguridad de Lumen"), extensions: ["json"] }] });
    if (!path) return;
    const fs = await import("@tauri-apps/plugin-fs");
    await fs.writeFile(path, new TextEncoder().encode(json));
    toast(L("Copia de seguridad con {0} elementos guardada", docs.length), "success", {
      detail: path,
      action: { label: L("Mostrar en la carpeta"), onClick: () => void revealInFolder(path).catch(() => {}) },
    });
    return;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
  toast(L("Copia de seguridad con {0} elementos creada", docs.length), "success");
}
