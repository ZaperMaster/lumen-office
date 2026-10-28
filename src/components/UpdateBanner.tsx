import { useEffect, useState } from "react";
import { Download, Loader2, RefreshCw, X } from "lucide-react";
import { useUpdater } from "@/lib/updater";
import { isDesktop } from "@/lib/files";
import { useSettings } from "@/store/settings";
import { Button } from "@/components/ui";

/** Comprueba al iniciar si hay versión nueva y muestra el aviso para instalarla. */
export function UpdateBanner() {
  const { status, version, notes, progress, error, dismissed, check, install, dismiss } = useUpdater();
  const autoCheck = useSettings((s) => s.autoCheckUpdates);
  const [showNotes, setShowNotes] = useState(false);

  // Unos segundos después de abrir, para no retrasar el arranque
  useEffect(() => {
    if (!isDesktop() || !autoCheck) return;
    const t = setTimeout(() => void check({ silent: true }), 5000);
    return () => clearTimeout(t);
  }, [autoCheck, check]);

  const visible = status === "downloading" || status === "installing" || (status === "available" && !dismissed) || (status === "error" && !!version);
  if (!visible) return null;

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : null;

  return (
    <div className="no-print fixed bottom-10 left-4 z-[150] w-[340px] animate-fade-in rounded-[calc(var(--radius)+4px)] border border-border bg-surface p-4 text-[13px] shadow-2xl">
      {status === "available" || status === "error" ? (
        <>
          <div className="mb-1 flex items-start gap-2">
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
              <RefreshCw className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold">Nueva versión disponible: {version}</div>
              <div className="text-[12px] text-muted">Se instala en segundos y conserva tus documentos.</div>
            </div>
            <button onClick={dismiss} className="rounded p-0.5 text-muted hover:text-text" aria-label="Cerrar aviso">
              <X className="size-4" />
            </button>
          </div>
          {status === "error" && error && <p className="mt-2 text-[12px] text-red-500">{error}</p>}
          {notes && (
            <>
              <button onClick={() => setShowNotes((v) => !v)} className="mt-1 text-[12px] font-medium text-accent hover:underline">
                {showNotes ? "Ocultar novedades" : "Ver novedades"}
              </button>
              {showNotes && (
                <div className="mt-2 max-h-48 overflow-y-auto rounded-md bg-surface-2 p-2.5 text-[12px] leading-relaxed whitespace-pre-wrap text-muted">
                  {notes}
                </div>
              )}
            </>
          )}
          <div className="mt-3 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={dismiss}>
              Más tarde
            </Button>
            <Button size="sm" variant="primary" icon={<Download className="size-3.5" />} onClick={() => void install()}>
              Actualizar ahora
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="mb-2 flex items-center gap-2 font-semibold">
            <Loader2 className="size-4 animate-spin text-accent" />
            {status === "installing" ? "Instalando… la app se reiniciará" : `Descargando la versión ${version}…`}
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-300"
              style={{ width: status === "installing" ? "100%" : pct !== null ? `${pct}%` : "30%" }}
            />
          </div>
          {pct !== null && status === "downloading" && (
            <div className="mt-1 text-right text-[11.5px] text-muted tabular-nums">
              {(progress.done / 1048576).toFixed(1)} / {(progress.total / 1048576).toFixed(1)} MB
            </div>
          )}
        </>
      )}
    </div>
  );
}
