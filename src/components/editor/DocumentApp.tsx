import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { EditorContent, type Editor } from "@tiptap/react";
import { ArrowLeft, FileDown, Minimize2, Moon, Settings, Sparkles, Star, Sun } from "lucide-react";
import { db, updateDoc, type DocRecord } from "@/lib/db";
import { debounce } from "@/lib/format";
import { exportDocx } from "@/lib/io";
import { getTheme } from "@/lib/themes";
import { MARGINS, MM_TO_PX, PAGE_SIZES, useSettings } from "@/store/settings";
import { useApp } from "@/store/app";
import { Ribbon } from "@/components/editor/Ribbon";
import { FindBar } from "@/components/editor/FindBar";
import { StatusBar, SaveIndicator } from "@/components/editor/StatusBar";
import { SelectionBubble } from "@/components/editor/SelectionBubble";
import { WordCountDialog } from "@/components/editor/WordCountDialog";
import { useDocEditor } from "@/components/editor/useDocEditor";
import { stepSize, parsePt } from "@/components/editor/controls";
import { AIResultCard } from "@/components/ai/AIResultCard";
import { ChatPanel } from "@/components/ai/ChatPanel";
import { useAI } from "@/components/ai/aiStore";
import { Button, IconButton, cn } from "@/components/ui";
import { Logo } from "@/components/Logo";

export default function DocumentApp({ id }: { id: string }) {
  const doc = useLiveQuery(() => db.docs.get(id).then((d) => d ?? null), [id]);
  const navigate = useApp((s) => s.navigate);
  if (doc === undefined) {
    return (
      <div className="grid h-full place-items-center">
        <div className="size-6 animate-spin rounded-full border-2 border-border border-t-accent" />
      </div>
    );
  }
  if (doc === null || doc.deletedAt) {
    return (
      <div className="grid h-full place-items-center">
        <div className="text-center">
          <p className="mb-3 text-muted">Este documento no existe o está en la papelera.</p>
          <Button variant="primary" onClick={() => navigate({ name: "home" })}>Volver al inicio</Button>
        </div>
      </div>
    );
  }
  return <DocumentEditor doc={doc} />;
}

function DocumentEditor({ doc }: { doc: DocRecord }) {
  // El contenido inicial se toma una sola vez; a partir de ahí manda el editor
  const [initial] = useState(doc.content);
  const { editor, saveState, saveNow } = useDocEditor(doc.id, initial, "Empieza a escribir o pulsa el botón IA para que te ayude…");
  if (!editor) return null;
  return <DocumentShell doc={doc} editor={editor} saveState={saveState} saveNow={saveNow} />;
}

function DocumentShell({ doc, editor, saveState, saveNow }: { doc: DocRecord; editor: Editor; saveState: ReturnType<typeof useDocEditor>["saveState"]; saveNow: () => void }) {
  const s = useSettings();
  const navigate = useApp((st) => st.navigate);
  const toast = useApp((st) => st.toast);
  const openSettings = useApp((st) => st.openSettings);
  const { panelOpen, setPanelOpen } = useAI();
  const discardAI = useAI((st) => st.discard);
  const [title, setTitle] = useState(doc.title);
  const [find, setFind] = useState<null | { replace: boolean }>(null);
  const [wordCount, setWordCount] = useState(false);
  const [pages, setPages] = useState(1);
  const paperRef = useRef<HTMLDivElement>(null);
  const dark = getTheme(s.themeId).dark;
  const focus = s.viewMode === "focus";

  const saveTitle = useMemo(() => debounce((t: string) => updateDoc(doc.id, { title: t }), 400), [doc.id]);
  useEffect(() => () => saveTitle.cancel(), [saveTitle]);
  useEffect(() => () => discardAI(), [discardAI]);

  // Dimensiones de la hoja
  const size = PAGE_SIZES[s.pageSize];
  const margin = MARGINS[s.margins];
  const landscape = s.orientation === "landscape";
  const pageW = (landscape ? size.h : size.w) * MM_TO_PX;
  const pageH = (landscape ? size.w : size.h) * MM_TO_PX;

  // Número de páginas aproximado según la altura del contenido
  useEffect(() => {
    const el = paperRef.current;
    if (!el) return;
    const count = () => {
      const byHeight = Math.ceil((el.scrollHeight - 2) / pageH);
      const byBreaks = el.querySelectorAll(".page-break").length + 1;
      setPages(Math.max(1, byHeight, byBreaks));
    };
    const ro = new ResizeObserver(count);
    ro.observe(el);
    editor.on("update", count);
    return () => {
      ro.disconnect();
      editor.off("update", count);
    };
  }, [pageH, s.viewMode, editor]);

  // Atajos de teclado globales
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === "f") { e.preventDefault(); setFind({ replace: false }); }
      else if (mod && k === "h") { e.preventDefault(); setFind({ replace: true }); }
      else if (mod && k === "s") { e.preventDefault(); saveNow(); toast("Documento guardado", "success"); }
      else if (mod && k === "p") { e.preventDefault(); window.print(); }
      else if (mod && e.key === "]") {
        e.preventDefault();
        const cur = parsePt(editor.getAttributes("textStyle").fontSize) ?? s.fontSize;
        editor.chain().focus().setFontSize(`${stepSize(cur, 1)}pt`).run();
      } else if (mod && e.key === "[") {
        e.preventDefault();
        const cur = parsePt(editor.getAttributes("textStyle").fontSize) ?? s.fontSize;
        editor.chain().focus().setFontSize(`${stepSize(cur, -1)}pt`).run();
      } else if (mod && e.shiftKey && k === "l") { e.preventDefault(); editor.chain().focus().setTextAlign("left").run(); }
      else if (mod && e.shiftKey && k === "e") { e.preventDefault(); editor.chain().focus().setTextAlign("center").run(); }
      else if (mod && e.shiftKey && k === "r") { e.preventDefault(); editor.chain().focus().setTextAlign("right").run(); }
      else if (mod && e.shiftKey && k === "j") { e.preventDefault(); editor.chain().focus().setTextAlign("justify").run(); }
      else if (mod && k === "j" && !e.shiftKey) { e.preventDefault(); setPanelOpen(!useAI.getState().panelOpen); }
      else if (e.key === "Escape" && focus && !find) s.set("viewMode", "page");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editor, focus, find, s, saveNow, setPanelOpen, toast]);

  const editorStyle = {
    fontFamily: s.fontFamily,
    fontSize: `${s.fontSize}pt`,
    lineHeight: s.lineHeight,
    "--para-spacing": `${s.paraSpacing}em`,
    "--page-pad-x": s.viewMode === "page" ? `${margin.h * MM_TO_PX}px` : "0px",
  } as React.CSSProperties;

  return (
    <div className="flex h-full flex-col bg-bg">
      {/* Barra de título */}
      <header
        className={cn(
          "no-print flex h-11 shrink-0 items-center gap-2 border-b border-border bg-surface px-2 transition-opacity",
          focus && "opacity-0 hover:opacity-100",
        )}
      >
        <IconButton label="Volver al inicio" onClick={() => navigate({ name: "home" })}>
          <ArrowLeft className="size-4" />
        </IconButton>
        <Logo className="size-6" />
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            saveTitle(e.target.value);
          }}
          placeholder="Documento sin título"
          className="h-8 min-w-0 flex-1 rounded-md bg-transparent px-2 text-[14px] font-semibold outline-none hover:bg-surface-2 focus:bg-surface-2"
          aria-label="Título del documento"
        />
        <SaveIndicator state={saveState} />
        <IconButton label={doc.favorite ? "Quitar de favoritos" : "Añadir a favoritos"} onClick={() => updateDoc(doc.id, { favorite: doc.favorite ? 0 : 1 })}>
          <Star className={cn("size-4", doc.favorite === 1 && "fill-amber-400 text-amber-400")} />
        </IconButton>
        <IconButton label={dark ? "Modo claro" : "Modo oscuro"} onClick={() => s.set("themeId", dark ? "light" : "dark")}>
          {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </IconButton>
        <IconButton label="Configuración" onClick={() => openSettings()}>
          <Settings className="size-4" />
        </IconButton>
        <Button
          size="sm"
          variant="outline"
          icon={<FileDown className="size-3.5" />}
          onClick={async () => {
            try {
              await exportDocx(editor.getJSON(), title);
              toast("Documento de Word exportado", "success");
            } catch {
              toast("No se pudo exportar", "error");
            }
          }}
        >
          Exportar .docx
        </Button>
        <Button size="sm" variant={panelOpen ? "secondary" : "primary"} icon={<Sparkles className="size-3.5" />} onClick={() => setPanelOpen(!panelOpen)}>
          IA
        </Button>
      </header>

      {!focus && (
        <Ribbon editor={editor} title={title} onFind={(replace) => setFind({ replace: !!replace })} onWordCount={() => setWordCount(true)} />
      )}

      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          <div
            className={cn("print-area h-full overflow-auto", s.viewMode === "page" ? "bg-desk" : "bg-paper")}
            onMouseDown={(e) => {
              // Clic en el escritorio: lleva el cursor al final
              if (e.target === e.currentTarget) {
                e.preventDefault();
                editor.commands.focus("end");
              }
            }}
          >
            <div style={{ zoom: s.zoom / 100 }} className={cn(s.viewMode === "page" ? "py-8" : "py-10")}>
              {s.viewMode === "page" ? (
                <div
                  ref={paperRef}
                  className="paper relative mx-auto"
                  style={{
                    width: pageW,
                    minHeight: pageH,
                    padding: `${margin.v * MM_TO_PX}px ${margin.h * MM_TO_PX}px`,
                    ...editorStyle,
                  }}
                  onMouseDown={(e) => {
                    if (e.target === e.currentTarget) {
                      e.preventDefault();
                      editor.commands.focus("end");
                    }
                  }}
                >
                  {Array.from({ length: pages - 1 }, (_, i) => (
                    <div key={i} className="no-print pointer-events-none absolute inset-x-0 border-t border-dashed border-[color-mix(in_oklab,var(--paper-text)_14%,transparent)]" style={{ top: pageH * (i + 1) }}>
                      <span className="absolute -top-2.5 right-2 bg-paper px-1.5 text-[10px] text-muted">Página {i + 2}</span>
                    </div>
                  ))}
                  <EditorContent editor={editor} />
                </div>
              ) : (
                <div ref={paperRef} className={cn("mx-auto px-8", focus ? "max-w-[720px] pt-[12vh]" : "max-w-[860px]")} style={editorStyle}>
                  <EditorContent editor={editor} />
                </div>
              )}
            </div>
          </div>
          {find && <FindBar editor={editor} withReplace={find.replace} onClose={() => { setFind(null); editor.commands.focus(); }} />}
          <AIResultCard editor={editor} />
          {focus && (
            <Button size="sm" variant="outline" className="no-print absolute right-5 bottom-5 shadow-soft" icon={<Minimize2 className="size-3.5" />} onClick={() => s.set("viewMode", "page")}>
              Salir del modo enfoque
            </Button>
          )}
        </div>
        {panelOpen && (
          <aside className="no-print w-[360px] shrink-0 animate-fade-in">
            <ChatPanel editor={editor} docTitle={title} onClose={() => setPanelOpen(false)} />
          </aside>
        )}
      </div>

      <SelectionBubble editor={editor} />
      {!focus && <StatusBar editor={editor} pages={pages} saveState={saveState} onWordCount={() => setWordCount(true)} />}
      <WordCountDialog editor={editor} open={wordCount} onOpenChange={setWordCount} pages={pages} />
    </div>
  );
}
