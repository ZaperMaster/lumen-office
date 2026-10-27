import { useEffect } from "react";
import { Cpu, Download, HardDrive, Loader2, Server } from "lucide-react";
import { LOCAL_MODELS, loadEngine, useLocalAI, webgpuAvailable } from "@/lib/localModels";
import { useSettings } from "@/store/settings";
import { useApp } from "@/store/app";
import { Button, cn } from "@/components/ui";

/** Barra de progreso de descarga/carga del modelo. */
export function ModelProgress({ className }: { className?: string }) {
  const { status, progress, message } = useLocalAI();
  if (status !== "loading") return null;
  return (
    <div className={cn("w-full", className)}>
      <div className="mb-1.5 flex items-center justify-between text-[12px] text-muted">
        <span className="flex items-center gap-1.5">
          <Loader2 className="size-3.5 animate-spin" />
          {message || "Cargando el modelo…"}
        </span>
        <span className="tabular-nums">{Math.round(progress * 100)}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
        <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${Math.max(2, progress * 100)}%` }} />
      </div>
    </div>
  );
}

/** Aviso compacto para los paneles de IA cuando el modelo aún no está listo. */
export function LocalAIBanner() {
  const { aiEngine, localModel, ollamaModel } = useSettings();
  const { status, loadedModel, cached, error } = useLocalAI();
  const openSettings = useApp((s) => s.openSettings);
  const model = LOCAL_MODELS.find((m) => m.id === localModel);

  useEffect(() => {
    if (aiEngine === "webllm" && webgpuAvailable()) loadEngine().then((m) => m.refreshCached()).catch(() => {});
  }, [aiEngine]);

  if (aiEngine === "ollama") {
    if (ollamaModel) return null;
    return (
      <div className="rounded-[var(--radius)] border border-amber-500/30 bg-amber-500/10 p-3 text-[13px]">
        Elige qué modelo de Ollama usar.
        <button onClick={() => openSettings("ai")} className="ml-1 font-semibold text-accent underline">Configurar</button>
      </div>
    );
  }
  if (!webgpuAvailable()) {
    return (
      <div className="rounded-[var(--radius)] border border-red-500/30 bg-red-500/10 p-3 text-[13px]">
        Este equipo no admite el motor integrado (WebGPU). Puedes usar Ollama.
        <button onClick={() => openSettings("ai")} className="ml-1 font-semibold text-accent underline">Configurar</button>
      </div>
    );
  }
  if (status === "loading") return <ModelProgress className="rounded-[var(--radius)] border border-border p-3" />;
  if (loadedModel === localModel) return null;

  const downloaded = cached[localModel];
  return (
    <div className="rounded-[var(--radius)] border border-border bg-surface-2/60 p-3 text-[13px]">
      <div className="mb-1 flex items-center gap-1.5 font-medium">
        <Cpu className="size-4 text-accent" />
        IA local · {model?.name ?? localModel}
      </div>
      <p className="mb-2.5 text-[12.5px] text-muted">
        {downloaded
          ? "El modelo está en tu equipo. Se cargará en la tarjeta gráfica al usarlo."
          : `Funciona sin conexión y tus textos no salen del equipo. La primera vez se descarga el modelo (${model?.sizeGB.toLocaleString("es-ES")} GB).`}
      </p>
      {error && <p className="mb-2 text-[12.5px] text-red-500">{error}</p>}
      <Button
        size="sm"
        variant="primary"
        icon={downloaded ? <Cpu className="size-3.5" /> : <Download className="size-3.5" />}
        onClick={() => loadEngine().then((m) => m.ensureModel(localModel)).catch(() => {})}
      >
        {downloaded ? "Cargar ahora" : "Descargar modelo"}
      </Button>
    </div>
  );
}

export function EngineIcon({ engine }: { engine: "webllm" | "ollama" }) {
  return engine === "ollama" ? <Server className="size-3.5" /> : <HardDrive className="size-3.5" />;
}
