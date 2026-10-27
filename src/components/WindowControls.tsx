import { useEffect, useState } from "react";
import { isDesktop } from "@/lib/files";

/** Ancho que ocupan los botones de la ventana (para que las barras les dejen sitio). */
export const WINDOW_CONTROLS_WIDTH = 138;

/**
 * Botones de minimizar, maximizar y cerrar, integrados en la app
 * (la ventana no usa la barra de título de Windows).
 */
export function WindowControls() {
  const [maximized, setMaximized] = useState(false);
  const desktop = isDesktop();

  useEffect(() => {
    if (!desktop) return;
    let unlisten: (() => void) | undefined;
    void import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
      const win = getCurrentWindow();
      setMaximized(await win.isMaximized());
      unlisten = await win.onResized(async () => setMaximized(await win.isMaximized()));
    });
    return () => unlisten?.();
  }, [desktop]);

  if (!desktop) return null;

  const run = (fn: "minimize" | "toggleMaximize" | "close") =>
    void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => getCurrentWindow()[fn]());

  const btn = "grid h-full w-[46px] place-items-center text-text/80 transition-colors";
  return (
    <div className="no-print fixed top-0 right-0 z-[120] flex h-9" style={{ width: WINDOW_CONTROLS_WIDTH }}>
      <button aria-label="Minimizar" onClick={() => run("minimize")} className={`${btn} hover:bg-text/10`}>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <path d="M0 5h10" stroke="currentColor" strokeWidth="1" />
        </svg>
      </button>
      <button aria-label={maximized ? "Restaurar" : "Maximizar"} onClick={() => run("toggleMaximize")} className={`${btn} hover:bg-text/10`}>
        {maximized ? (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
            <path d="M2.5 2.5V.5h7v7h-2" stroke="currentColor" strokeWidth="1" />
            <rect x=".5" y="2.5" width="7" height="7" stroke="currentColor" strokeWidth="1" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
            <rect x=".5" y=".5" width="9" height="9" stroke="currentColor" strokeWidth="1" />
          </svg>
        )}
      </button>
      <button aria-label="Cerrar" onClick={() => run("close")} className={`${btn} hover:bg-[#e81123] hover:text-white`}>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1.1" />
        </svg>
      </button>
    </div>
  );
}
