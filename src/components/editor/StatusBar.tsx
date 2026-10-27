import { useEditorState, type Editor } from "@tiptap/react";
import { Check, CloudUpload, FileText, Focus, Monitor } from "lucide-react";
import { useSettings, type ViewMode } from "@/store/settings";
import { countWords } from "@/lib/db";
import { readingTime } from "@/lib/format";
import { Slider, Tooltip, cn } from "@/components/ui";
import { ModelMemoryIndicator } from "@/components/ai/LocalAIStatus";

export type SaveState = "saved" | "saving" | "dirty";

export function SaveIndicator({ state }: { state: SaveState }) {
  return (
    <span className="flex items-center gap-1.5 text-[12px] text-muted">
      {state === "saved" ? <Check className="size-3.5 text-emerald-500" /> : <CloudUpload className="size-3.5 animate-pulse" />}
      {state === "saved" ? "Guardado" : "Guardando…"}
    </span>
  );
}

export function StatusBar({
  editor,
  pages,
  saveState,
  onWordCount,
}: {
  editor: Editor;
  pages: number;
  saveState: SaveState;
  onWordCount: () => void;
}) {
  const { zoom, set, viewMode } = useSettings();
  const stats = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const { from, to, empty } = e.state.selection;
      const selWords = empty ? 0 : countWords(e.state.doc.textBetween(from, to, " "));
      const text = e.getText();
      return { words: countWords(text), chars: text.length, selWords };
    },
  });
  const views: { id: ViewMode; label: string; icon: typeof FileText }[] = [
    { id: "page", label: "Diseño de impresión", icon: FileText },
    { id: "web", label: "Diseño web", icon: Monitor },
    { id: "focus", label: "Modo enfoque", icon: Focus },
  ];

  return (
    <footer className="no-print flex h-7 shrink-0 items-center gap-4 border-t border-border bg-surface px-3 text-[12px] text-muted">
      {viewMode === "page" && <span>{pages === 1 ? "1 página" : `${pages} páginas`}</span>}
      <button onClick={onWordCount} className="hover:text-text">
        {stats.selWords ? `${stats.selWords} de ${stats.words} palabras` : `${stats.words.toLocaleString("es-ES")} palabras`}
      </button>
      <span>{stats.chars.toLocaleString("es-ES")} caracteres</span>
      <span className="hidden md:inline">{readingTime(stats.words)}</span>
      <span className="hidden md:inline">Español (España)</span>
      <SaveIndicator state={saveState} />
      <ModelMemoryIndicator />
      <div className="ml-auto flex items-center gap-1">
        {views.map((v) => (
          <Tooltip key={v.id} label={v.label} side="top">
            <button
              onClick={() => set("viewMode", v.id)}
              className={cn("grid size-6 place-items-center rounded", viewMode === v.id ? "bg-accent-soft text-accent" : "hover:bg-surface-2")}
              aria-label={v.label}
            >
              <v.icon className="size-3.5" />
            </button>
          </Tooltip>
        ))}
        <span className="mx-2 h-4 w-px bg-border" />
        <button onClick={() => set("zoom", Math.max(50, zoom - 10))} className="px-1 hover:text-text" aria-label="Alejar">−</button>
        <Slider value={zoom} onChange={(v) => set("zoom", v)} min={50} max={200} step={5} label="Zoom" className="w-28" />
        <button onClick={() => set("zoom", Math.min(200, zoom + 10))} className="px-1 hover:text-text" aria-label="Acercar">+</button>
        <button onClick={() => set("zoom", 100)} className="w-10 text-right hover:text-text">{zoom}%</button>
      </div>
    </footer>
  );
}
