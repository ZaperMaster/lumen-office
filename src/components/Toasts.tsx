import { CheckCircle2, Info, XCircle } from "lucide-react";
import { useApp } from "@/store/app";
import { cn } from "@/components/ui";

export function Toasts() {
  const { toasts, dismissToast } = useApp();
  return (
    <div className="no-print pointer-events-none fixed right-4 bottom-10 z-[200] flex flex-col items-end gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismissToast(t.id)}
          className={cn(
            "pointer-events-auto flex max-w-sm animate-fade-in items-center gap-2.5 rounded-[var(--radius)] border border-border",
            "bg-surface px-3.5 py-2.5 text-left text-[13px] text-text shadow-soft",
          )}
        >
          {t.tone === "success" && <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />}
          {t.tone === "error" && <XCircle className="size-4 shrink-0 text-red-500" />}
          {t.tone === "info" && <Info className="size-4 shrink-0 text-accent" />}
          {t.message}
        </button>
      ))}
    </div>
  );
}
