import { isDesktop, revealInFolder } from "@/lib/files";
import { safeFileName } from "@/lib/fileName";
import { useApp } from "@/store/app";

import { L } from "@/lib/i18n";
/*
 * Guardar como PDF de un clic: se pregunta dónde y se crea el PDF con el motor
 * de impresión (texto real, con la misma maquetación que al imprimir), sin la
 * ventana de imprimir. En el navegador se abre la ventana de imprimir.
 */

export interface PdfPage {
  /** Tamaño del papel en milímetros */
  widthMm: number;
  heightMm: number;
  marginMm?: number;
}

const MM_PER_IN = 25.4;

/**
 * @param prepare deja la página lista para imprimir; devuelve cómo deshacerlo
 */
export async function exportPdf(title: string, page: PdfPage, prepare?: () => Promise<() => void>): Promise<string | null> {
  const { toast } = useApp.getState();
  if (!isDesktop()) {
    const undo = await prepare?.();
    window.print();
    undo?.();
    return null;
  }
  const { save } = await import("@tauri-apps/plugin-dialog");
  const picked = await save({ title: L("Guardar como PDF"), defaultPath: `${safeFileName(title)}.pdf`, filters: [{ name: L("PDF"), extensions: ["pdf"] }] });
  if (!picked) return null;
  const path = /\.pdf$/i.test(picked) ? picked : `${picked}.pdf`;
  const undo = await prepare?.();
  // Un momento para que se dibuje todo antes de imprimir
  await new Promise((r) => setTimeout(r, 120));
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("print_to_pdf", {
      options: { path, width: page.widthMm / MM_PER_IN, height: page.heightMm / MM_PER_IN, margin: (page.marginMm ?? 0) / MM_PER_IN },
    });
    toast(L("PDF guardado"), "success", {
      detail: path,
      action: { label: L("Mostrar en la carpeta"), onClick: () => void revealInFolder(path).catch(() => {}) },
    });
    return path;
  } catch (e) {
    toast(L("No se pudo guardar el PDF"), "error", { detail: String(e) });
    return null;
  } finally {
    undo?.();
  }
}

/** Pone el tamaño de papel para imprimir (lo usan las tres herramientas). */
export function setPrintPage(css: string) {
  let el = document.getElementById("lumen-page-size") as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = "lumen-page-size";
    document.head.appendChild(el);
  }
  el.textContent = css;
}
