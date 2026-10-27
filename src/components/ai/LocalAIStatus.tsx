import { useEffect } from "react";
import { Cpu, Download, Loader2, Globe } from "lucide-react";
import { LOCAL_MODELS, loadEngine, refreshCached, useLocalAI, webgpuAvailable } from "@/lib/localModels";
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

/** Aviso para los paneles de IA cuando el motor elegido aún no está listo. */
export function LocalAIBanner() {
  const s = useSettings();
  const { status, loadedModel, cached, error } = useLocalAI();
  const openSettings = useApp((st) => st.openSettings);
  const model = LOCAL_MODELS.find((m) => m.id === s.localModel);

  useEffect(() => {
    if (s.aiEngine === "webllm") void refreshCached();
  }, [s.aiEngine]);

  const configure = (
    <button onClick={() => openSettings("ai")} className="ml-1 font-semibold text-accent underline">
      Configurar
    </button>
  );

  if (s.aiEngine === "api") {
    const missing = s.apiProvider === "anthropic" ? !s.anthropicKey : !s.openaiModel || (!s.openaiKey && !/localhost|127\.0\.0\.1/.test(s.openaiBaseUrl));
    if (missing) {
      return (
        <div className="rounded-[var(--radius)] border border-amber-500/30 bg-amber-500/10 p-3 text-[13px]">
          Falta la clave o el modelo de tu API.
          {configure}
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1.5 text-[11.5px] text-muted">
        <Globe className="size-3.5" />
        Usando tu API: los textos que envíes se mandan a ese servicio.
      </div>
    );
  }
  if (s.aiEngine === "ollama") {
    if (s.ollamaModel) return null;
    return (
      <div className="rounded-[var(--radius)] border border-amber-500/30 bg-amber-500/10 p-3 text-[13px]">
        Elige qué modelo de Ollama usar.
        {configure}
      </div>
    );
  }
  if (!webgpuAvailable()) {
    return (
      <div className="rounded-[var(--radius)] border border-red-500/30 bg-red-500/10 p-3 text-[13px]">
        Este equipo no admite el motor integrado (WebGPU). Puedes usar Ollama o tu propia API.
        {configure}
      </div>
    );
  }
  if (status === "loading") return <ModelProgress className="rounded-[var(--radius)] border border-border p-3" />;
  if (loadedModel === s.localModel) return null;

  const downloaded = cached[s.localModel];
  return (
    <div className="rounded-[var(--radius)] border border-border bg-surface-2/60 p-3 text-[13px]">
      <div className="mb-1 flex items-center gap-1.5 font-medium">
        <Cpu className="size-4 text-accent" />
        IA local · {model?.name ?? s.localModel}
      </div>
      <p className="mb-2.5 text-[12.5px] text-muted">
        {downloaded
          ? s.aiAutoUnload
            ? "El modelo está en tu equipo. Se carga en la tarjeta gráfica al usarlo y se libera solo cuando dejas de usarlo."
            : "El modelo está en tu equipo. Se carga en la tarjeta gráfica al usarlo y se queda cargado para responder más rápido."
          : `Funciona sin conexión y tus textos no salen del equipo. La primera vez se descarga el modelo (${model?.sizeGB.toLocaleString("es-ES")} GB).`}
      </p>
      {error && <p className="mb-2 text-[12.5px] text-red-500">{error}</p>}
      <Button
        size="sm"
        variant="primary"
        icon={downloaded ? <Cpu className="size-3.5" /> : <Download className="size-3.5" />}
        onClick={() => loadEngine().then((m) => m.ensureModel(s.localModel)).catch(() => {})}
      >
        {downloaded ? "Cargar ahora" : "Descargar modelo"}
      </Button>
    </div>
  );
}
