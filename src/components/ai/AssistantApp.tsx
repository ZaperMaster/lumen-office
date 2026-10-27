import { ArrowLeft, Settings2, Sparkles } from "lucide-react";
import { ChatPanel } from "@/components/ai/ChatPanel";
import { createDoc } from "@/lib/db";
import { markdownToJSON } from "@/lib/io";
import { openDoc } from "@/lib/actions";
import { LOCAL_MODELS } from "@/lib/localModels";
import { useApp } from "@/store/app";
import { useSettings } from "@/store/settings";
import { IconButton } from "@/components/ui";
import { currentModelName } from "@/lib/ai";
import { ModelMemoryIndicator } from "@/components/ai/LocalAIStatus";

export default function AssistantApp() {
  const navigate = useApp((s) => s.navigate);
  const openSettings = useApp((s) => s.openSettings);
  // Sin selector: se re-renderiza con cualquier cambio de la configuración de IA
  const { aiEngine, localModel, set } = useSettings();

  const createDocument = async (md: string) => {
    const heading = md.match(/^#\s+(.+)$/m)?.[1];
    const doc = await createDoc("document", { title: heading ?? "Documento de la IA", content: markdownToJSON(md) });
    openDoc(doc);
  };

  return (
    <div className="flex h-full flex-col bg-surface">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
        <IconButton label="Volver al inicio" onClick={() => navigate({ name: "home" })}>
          <ArrowLeft className="size-4" />
        </IconButton>
        <span className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white">
          <Sparkles className="size-4" />
        </span>
        <span className="text-[14px] font-semibold">Asistente IA</span>
        {aiEngine === "api" ? (
          <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] font-medium text-sky-600">Tu API</span>
        ) : (
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-600">Local · sin conexión</span>
        )}
        <ModelMemoryIndicator />
        <div className="ml-auto flex items-center gap-1">
          {aiEngine === "webllm" ? (
            <select
              value={localModel}
              onChange={(e) => set("localModel", e.target.value)}
              className="h-8 rounded-md border border-border bg-surface px-2 text-[12.5px]"
              aria-label="Modelo local"
            >
              {LOCAL_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-[12.5px] text-muted">{currentModelName()}</span>
          )}
          <IconButton label="Configurar la IA" onClick={() => openSettings("ai")}>
            <Settings2 className="size-4" />
          </IconButton>
        </div>
      </header>
      <div className="min-h-0 flex-1">
        <ChatPanel variant="full" storageKey="assistant" onCreateDocument={createDocument} />
      </div>
    </div>
  );
}
