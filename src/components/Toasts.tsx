import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { useApp } from "@/store/app";

export function Toasts() {
  const { toasts, dismissToast } = useApp();
  return (
    <div className="no-print pointer-events-none fixed right-4 bottom-10 z-[200] flex flex-col items-end gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className="pointer-events-auto flex max-w-md animate-fade-in items-start gap-2.5 rounded-[var(--radius)] border border-border bg-surface px-3.5 py-2.5 text-[13px] text-text shadow-soft"
        >
          {t.tone === "success" && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />}
          {t.tone === "error" && <XCircle className="mt-0.5 size-4 shrink-0 text-red-500" />}
          {t.tone === "info" && <Info className="mt-0.5 size-4 shrink-0 text-accent" />}
          <div className="min-w-0 flex-1">
            <div>{t.message}</div>
            {t.detail && (
              <div className="mt-0.5 truncate font-mono text-[11.5px] text-muted" title={t.detail}>
                {t.detail}
              </div>
            )}
            {t.action && (
              <button
                onClick={() => {
                  t.action!.onClick();
                  dismissToast(t.id);
                }}
                className="mt-1.5 text-[12.5px] font-semibold text-accent hover:underline"
              >
                {t.action.label}
              </button>
            )}
          </div>
          <button onClick={() => dismissToast(t.id)} className="rounded p-0.5 text-muted hover:text-text" aria-label="Cerrar aviso">
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
