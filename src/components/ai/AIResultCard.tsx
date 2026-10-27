import { useMemo } from "react";
import type { Editor } from "@tiptap/react";
import { AlertCircle, ArrowDownToLine, Check, RotateCcw, Sparkles, Square, X } from "lucide-react";
import { useAI } from "@/components/ai/aiStore";
import { markdownToHtml } from "@/lib/io";
import { useApp } from "@/store/app";
import { Button } from "@/components/ui";
import { ModelProgress } from "@/components/ai/LocalAIStatus";

/** Tarjeta flotante con la respuesta de la IA y opciones para aplicarla. */
export function AIResultCard({ editor }: { editor: Editor }) {
  const { status, label, output, error, insertAfter, stop, discard, accept, retry } = useAI();
  const openSettings = useApp((s) => s.openSettings);
  const html = useMemo(() => markdownToHtml(output), [output]);
  if (status === "idle") return null;

  return (
    <div className="no-print absolute bottom-4 left-1/2 z-30 w-[min(680px,calc(100%-32px))] -translate-x-1/2 animate-fade-in rounded-[calc(var(--radius)+6px)] border border-border bg-surface shadow-2xl">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <span className="grid size-6 place-items-center rounded-md bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white">
          <Sparkles className="size-3.5" />
        </span>
        <span className="text-[13px] font-semibold">{label}</span>
        {status === "running" && <span className="text-[12px] text-muted">escribiendo…</span>}
        <button onClick={discard} className="ml-auto rounded-md p-1 text-muted hover:bg-surface-2 hover:text-text" aria-label="Cerrar">
          <X className="size-4" />
        </button>
      </div>

      <div className="max-h-[300px] overflow-y-auto px-5 py-3">
        {status === "error" ? (
          <div className="flex items-start gap-2.5 text-[13.5px] text-red-500">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <div>
              {error}
              {error?.includes("Configuración") && (
                <button onClick={() => openSettings("ai")} className="ml-2 font-medium text-accent underline">
                  Abrir configuración
                </button>
              )}
            </div>
          </div>
        ) : output ? (
          <div
            className={`lumen-editor text-[14px] leading-relaxed ${status === "running" ? "ai-streaming" : ""}`}
            style={{ color: "var(--text)", whiteSpace: "normal" }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <>
            <ModelProgress className="mb-2" />
            <div className="flex items-center gap-2 py-2 text-[13px] text-muted">
              <span className="size-2 animate-pulse rounded-full bg-accent" />
              Pensando…
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-border px-4 py-2.5">
        {status === "running" ? (
          <Button size="sm" variant="outline" icon={<Square className="size-3" />} onClick={stop}>
            Detener
          </Button>
        ) : status === "done" ? (
          <>
            <Button size="sm" variant="primary" icon={<Check className="size-3.5" />} onClick={() => accept(editor, insertAfter ? "below" : "replace")}>
              {insertAfter ? "Insertar debajo" : "Reemplazar"}
            </Button>
            <Button size="sm" variant="outline" icon={<ArrowDownToLine className="size-3.5" />} onClick={() => accept(editor, insertAfter ? "replace" : "below")}>
              {insertAfter ? "Reemplazar selección" : "Insertar debajo"}
            </Button>
            <Button size="sm" variant="ghost" icon={<RotateCcw className="size-3.5" />} onClick={() => retry(editor)}>
              Reintentar
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" icon={<RotateCcw className="size-3.5" />} onClick={() => retry(editor)}>
            Reintentar
          </Button>
        )}
        <Button size="sm" variant="ghost" className="ml-auto" onClick={discard}>
          Descartar
        </Button>
      </div>
    </div>
  );
}
