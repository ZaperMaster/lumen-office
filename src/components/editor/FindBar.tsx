import { useEffect, useRef, useState } from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import { CaseSensitive, ChevronDown, ChevronUp, Replace, X } from "lucide-react";
import type { SearchStorage } from "@/components/editor/extensions";
import { Button, IconButton, Input } from "@/components/ui";

export function FindBar({ editor, withReplace, onClose }: { editor: Editor; withReplace: boolean; onClose: () => void }) {
  const [term, setTerm] = useState(() => {
    const { from, to, empty } = editor.state.selection;
    return empty ? "" : editor.state.doc.textBetween(from, to).slice(0, 100);
  });
  const [replace, setReplace] = useState("");
  const [showReplace, setShowReplace] = useState(withReplace);
  const inputRef = useRef<HTMLInputElement>(null);

  const info = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const s = (e.storage as unknown as { search: SearchStorage }).search;
      return { count: s.results.length, index: s.index, caseSensitive: s.caseSensitive };
    },
  });

  useEffect(() => setShowReplace((v) => v || withReplace), [withReplace]);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [withReplace]);
  useEffect(() => {
    editor.commands.setSearchTerm(term);
  }, [term, editor]);
  useEffect(() => {
    editor.commands.setReplaceTerm(replace);
  }, [replace, editor]);
  useEffect(() => () => void editor.commands.setSearchTerm(""), [editor]);

  return (
    <div className="no-print absolute top-3 right-6 z-30 w-[380px] animate-pop-in rounded-[calc(var(--radius)+2px)] border border-border bg-surface p-2.5 shadow-soft">
      <div className="flex items-center gap-1.5">
        <IconButton size="sm" label={showReplace ? "Ocultar reemplazar" : "Mostrar reemplazar"} onClick={() => setShowReplace((v) => !v)}>
          <Replace className="size-4" />
        </IconButton>
        <div className="relative flex-1">
          <Input
            ref={inputRef}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (e.shiftKey) editor.commands.previousSearchResult();
                else editor.commands.nextSearchResult();
              }
              if (e.key === "Escape") onClose();
            }}
            placeholder="Buscar en el documento"
            className="h-8 pr-16 text-[13px]"
          />
          <span className="absolute top-1/2 right-2.5 -translate-y-1/2 text-[11.5px] text-muted">
            {term ? (info.count ? `${info.index + 1} de ${info.count}` : "Sin resultados") : ""}
          </span>
        </div>
        <IconButton size="sm" label="Coincidir mayúsculas" active={info.caseSensitive} onClick={() => editor.commands.setCaseSensitive(!info.caseSensitive)}>
          <CaseSensitive className="size-4" />
        </IconButton>
        <IconButton size="sm" label="Anterior" shortcut="Shift+Enter" disabled={!info.count} onClick={() => editor.commands.previousSearchResult()}>
          <ChevronUp className="size-4" />
        </IconButton>
        <IconButton size="sm" label="Siguiente" shortcut="Enter" disabled={!info.count} onClick={() => editor.commands.nextSearchResult()}>
          <ChevronDown className="size-4" />
        </IconButton>
        <IconButton size="sm" label="Cerrar" shortcut="Esc" onClick={onClose}>
          <X className="size-4" />
        </IconButton>
      </div>
      {showReplace && (
        <div className="mt-2 flex items-center gap-1.5 pl-[34px]">
          <Input
            value={replace}
            onChange={(e) => setReplace(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") editor.commands.replaceCurrent();
              if (e.key === "Escape") onClose();
            }}
            placeholder="Reemplazar por"
            className="h-8 flex-1 text-[13px]"
          />
          <Button size="sm" variant="outline" disabled={!info.count} onClick={() => editor.commands.replaceCurrent()}>
            Reemplazar
          </Button>
          <Button size="sm" variant="outline" disabled={!info.count} onClick={() => editor.commands.replaceAll()}>
            Todo
          </Button>
        </div>
      )}
    </div>
  );
}
