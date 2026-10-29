import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { EditorContent, type Editor } from "@tiptap/react";
import { ArrowLeft, FileText, Loader2, Minimize2, Moon, Save, Settings, Sparkles, Star, Sun } from "lucide-react";
import { db, updateDoc, type DocRecord } from "@/lib/db";
import { debounce } from "@/lib/format";
import {
  exportDocument, fileName, isDesktop, openFileFromDisk, registerOpenDoc, revealInFolder, saveDocument, saveDocumentAs, writeLinkedFile,
  type DocSource,
} from "@/lib/files";
import { useConfirm } from "@/store/confirm";
import { openDoc } from "@/lib/actions";
import { getTheme } from "@/lib/themes";
import { MARGINS, MM_TO_PX, PAGE_SIZES, useSettings } from "@/store/settings";
import { useApp } from "@/store/app";
import { Ribbon, type FileActions, type LayoutActions } from "@/components/editor/Ribbon";
import { HeaderFooterBar } from "@/components/editor/HeaderFooterBar";
import type { PaginationStorage } from "@/components/editor/pagination";
import { pageTexts, withDefaults, type HeaderFooter, type PageLayout } from "@/lib/pageLayout";
import { FindBar } from "@/components/editor/FindBar";
import { StatusBar, SaveIndicator } from "@/components/editor/StatusBar";
import { SelectionBubble } from "@/components/editor/SelectionBubble";
import { LinkBubble } from "@/components/editor/LinkBubble";
import { WordCountDialog } from "@/components/editor/WordCountDialog";
import { useDocEditor } from "@/components/editor/useDocEditor";
import { stepSize, parsePt } from "@/components/editor/controls";
import { AIResultCard } from "@/components/ai/AIResultCard";
import { ChatPanel } from "@/components/ai/ChatPanel";
import { useAI } from "@/components/ai/aiStore";
import { Button, IconButton, Tooltip, cn } from "@/components/ui";
import { Logo } from "@/components/Logo";

/** Espacio entre hojas en la vista de páginas (px). */
const PAGE_GAP = 24;

/** Encabezado de la primera página o pie de la última (los demás van entre páginas). */
function HfZone({ zone, height, texts, onEdit }: { zone: "header" | "footer"; height: number; texts: HeaderFooter; onEdit: (z: "header" | "footer", el: HTMLElement) => void }) {
  return (
    <div
      className="hf-zone relative"
      data-zone={zone}
      style={{ height }}
      onMouseDown={(e) => {
        e.preventDefault();
        onEdit(zone, e.currentTarget);
      }}
    >
      {zone === "footer" && <span className="hf-hint">Haz clic para escribir el pie de página</span>}
      <span className="hf-row">
        <span className="hf-cell hf-left">{texts.left}</span>
        <span className="hf-cell hf-center">{texts.center}</span>
        <span className="hf-cell hf-right">{texts.right}</span>
      </span>
      {zone === "header" && <span className="hf-hint">Haz clic para escribir el encabezado</span>}
    </div>
  );
}

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

  // Valores actuales para las acciones de archivo (sin recrearlas en cada tecla)
  const docRef = useRef(doc);
  docRef.current = doc;
  const titleRef = useRef(title);
  titleRef.current = title;
  const source = useCallback(
    (): DocSource => ({
      json: editor.getJSON(),
      html: editor.getHTML(),
      text: editor.getText({ blockSeparator: "\n\n" }),
      title: titleRef.current,
      pageLayout: docRef.current.pageLayout ?? null,
    }),
    [editor],
  );
  const files: FileActions = useMemo(() => {
    return {
      filePath: doc.filePath ?? null,
      // Tras guardar a mano, los cambios hasta ese momento cuentan como guardados en el archivo
      save: () => {
        saveNow();
        const upTo = edits.current;
        void saveDocument(docRef.current, source()).then((p) => {
          if (p) writtenEdits.current = Math.max(writtenEdits.current, upTo);
        });
      },
      saveAs: () => {
        saveNow();
        const upTo = edits.current;
        void saveDocumentAs(docRef.current, source()).then((p) => {
          if (p) writtenEdits.current = Math.max(writtenEdits.current, upTo);
        });
      },
      exportAs: (format) => void exportDocument(format, source()),
    };
  }, [doc.filePath, source, saveNow]);
  const unsavedFile = !!doc.filePath && (doc.savedAt ?? 0) < doc.updatedAt;

  /* ---------------- Autoguardado en el archivo del disco ---------------- */
  const autoSave = useSettings((st) => st.fileAutoSave);
  const [diskState, setDiskState] = useState<"idle" | "saving" | "error">("idle");
  const failed = useRef(false);

  // Contador de cambios: cada edición lo sube; al escribir en el archivo se recuerda
  // hasta qué cambio quedó guardado. No depende de que la base interna se haya refrescado.
  const edits = useRef((doc.savedAt ?? 0) < doc.updatedAt ? 1 : 0);
  const writtenEdits = useRef(0);
  useEffect(() => {
    const bump = () => void (edits.current += 1);
    editor.on("update", bump);
    return () => void editor.off("update", bump);
  }, [editor]);
  useEffect(() => {
    if (title !== doc.title) edits.current += 1;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title]);

  /** ¿Hay cambios que aún no están en el archivo del disco? */
  const isDirty = useCallback(() => !!docRef.current.filePath && edits.current > writtenEdits.current, []);

  /** Escribe ya en el archivo vinculado, sin avisos salvo si falla. */
  const writeNow = useCallback(async (): Promise<boolean> => {
    const d = docRef.current;
    if (!d.filePath || !isDesktop()) return true;
    await saveNow();
    setDiskState("saving");
    const upTo = edits.current;
    try {
      await writeLinkedFile(d, source());
      writtenEdits.current = Math.max(writtenEdits.current, upTo);
      setDiskState("idle");
      if (failed.current) {
        failed.current = false;
        toast(`Guardado de nuevo en «${fileName(d.filePath)}»`, "success");
      }
      return true;
    } catch (e) {
      setDiskState("error");
      // Solo se avisa una vez hasta que vuelva a funcionar
      if (!failed.current) {
        failed.current = true;
        toast(`No se pudo guardar automáticamente en «${fileName(d.filePath)}»`, "error", {
          detail: e instanceof Error ? e.message : String(e),
        });
      }
      return false;
    }
  }, [saveNow, source, toast]);

  // Unos segundos después del último cambio, se escribe en el archivo
  useEffect(() => {
    if (!autoSave || !isDesktop() || !doc.filePath || !unsavedFile) return;
    const t = setTimeout(() => void writeNow(), 2000);
    return () => clearTimeout(t);
  }, [autoSave, doc.filePath, doc.updatedAt, unsavedFile, writeNow]);

  // Se registra para que el cierre de la ventana sepa si hay cambios sin guardar
  useEffect(
    () => registerOpenDoc({
        id: doc.id,
        title: () => titleRef.current,
        path: () => docRef.current.filePath ?? null,
        dirty: isDirty,
        save: writeNow,
        flush: saveNow,
      }),
    [doc.id, isDirty, writeNow, saveNow],
  );

  // Al salir del documento: con autoguardado se guarda al momento; si no, se pregunta
  const setLeaveGuard = useApp((st) => st.setLeaveGuard);
  useEffect(() => {
    const guard = async () => {
      const d = docRef.current;
      if (!isDesktop() || !d.filePath || !isDirty()) return true;
      if (useSettings.getState().fileAutoSave && (await writeNow())) return true;
      const choice = await useConfirm.getState().askUnsaved([fileName(d.filePath)]);
      if (choice === "cancel") return false;
      if (choice === "save") return writeNow();
      return true;
    };
    setLeaveGuard(guard);
    return () => {
      if (useApp.getState().leaveGuard === guard) setLeaveGuard(null);
    };
  }, [isDirty, setLeaveGuard, writeNow]);
  useEffect(() => () => saveTitle.cancel(), [saveTitle]);
  useEffect(() => () => discardAI(), [discardAI]);

  // Dimensiones de la hoja
  const size = PAGE_SIZES[s.pageSize];
  const margin = MARGINS[s.margins];
  const landscape = s.orientation === "landscape";
  const pageW = (landscape ? size.h : size.w) * MM_TO_PX;
  const pageH = (landscape ? size.w : size.h) * MM_TO_PX;

  /* ---------------- Páginas reales: encabezado, pie y numeración ---------------- */
  const layout = useMemo(() => withDefaults(doc.pageLayout), [doc.pageLayout]);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const [lastUsed, setLastUsed] = useState(0);
  // Encabezado o pie que se está editando y su posición en la página (px sin zoom)
  const mbRef = useRef(0);
  const [hfEdit, setHfEdit] = useState<{ zone: "header" | "footer"; top: number } | null>(null);
  const openHf = useCallback(
    (zone: "header" | "footer", el?: HTMLElement) => {
      const paged = paperRef.current;
      if (!paged || !paged.classList.contains("paged-doc")) {
        // En las otras vistas se pasa a la de páginas para editarlo
        useSettings.getState().set("viewMode", "page");
        return;
      }
      const z = paged.offsetWidth ? paged.getBoundingClientRect().width / paged.offsetWidth : 1;
      let top: number;
      if (el) top = (el.getBoundingClientRect().top - paged.getBoundingClientRect().top) / z;
      else top = zone === "header" ? 0 : paged.offsetHeight - mbRef.current;
      setHfEdit({ zone, top });
      if (!el) setTimeout(() => paged.querySelector(".hf-editing")?.scrollIntoView({ block: "center", behavior: "smooth" }), 30);
    },
    [],
  );
  
  const mt = margin.v * MM_TO_PX;
  const mb = margin.v * MM_TO_PX;
  mbRef.current = mb;
  const contentH = pageH - mt - mb;

  const saveLayout = useCallback(
    (next: PageLayout) => {
      edits.current += 1; // cuenta como cambio para guardar en el archivo
      void updateDoc(doc.id, { pageLayout: next });
    },
    [doc.id],
  );

  const layoutActions: LayoutActions = useMemo(
    () => ({
      edit: (zone) => openHf(zone),
      setPageNumber: (zone, slot, text) => {
        // Un solo número de página: se quita de donde estuviera antes
        const strip = (hf: HeaderFooter): HeaderFooter => ({
          left: hf.left.includes("{pagina}") ? "" : hf.left,
          center: hf.center.includes("{pagina}") ? "" : hf.center,
          right: hf.right.includes("{pagina}") ? "" : hf.right,
        });
        const next = { ...layout, header: strip(layout.header), footer: strip(layout.footer) };
        next[zone] = { ...next[zone], [slot]: text };
        saveLayout(next);
      },
      removePageNumbers: () => {
        const strip = (hf: HeaderFooter): HeaderFooter => ({
          left: hf.left.includes("{pagina}") ? "" : hf.left,
          center: hf.center.includes("{pagina}") ? "" : hf.center,
          right: hf.right.includes("{pagina}") ? "" : hf.right,
        });
        saveLayout({ ...layout, header: strip(layout.header), footer: strip(layout.footer) });
      },
      hasPageNumbers: JSON.stringify([layout.header, layout.footer]).includes("{pagina}"),
    }),
    [layout, saveLayout],
  );

  // La paginación necesita las medidas de la hoja y los textos de encabezado y pie
  const userName = s.userName;
  useEffect(() => {
    const st = (editor.storage as unknown as { pagination: PaginationStorage }).pagination;
    st.enabled = s.viewMode === "page";
    st.config = {
      pageHeight: pageH,
      marginTop: mt,
      marginBottom: mb,
      gap: PAGE_GAP,
      texts: (i, n) => pageTexts(layoutRef.current, i, n, titleRef.current, userName),
    };
    st.onLayout = (p, used) => {
      setPages(p);
      setLastUsed(used);
    };
    st.onEditHeaderFooter = (zone, el) => openHf(zone, el);
    st.refresh();
  }, [editor, s.viewMode, pageH, pageW, mt, mb, layout, title, userName]);

  // Tamaño del papel al imprimir o guardar como PDF
  useEffect(() => {
    let el = document.getElementById("lumen-page-size") as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement("style");
      el.id = "lumen-page-size";
      document.head.appendChild(el);
    }
    const w = landscape ? size.h : size.w;
    const h = landscape ? size.w : size.h;
    el.textContent = `@page { size: ${w}mm ${h}mm; margin: 0; }`;
  }, [landscape, size.w, size.h]);

  const firstTexts = pageTexts(layout, 0, pages, title, userName);
  const lastTexts = pageTexts(layout, pages - 1, pages, title, userName);

  // Atajos de teclado globales
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === "f") { e.preventDefault(); setFind({ replace: false }); }
      else if (mod && k === "h") { e.preventDefault(); setFind({ replace: true }); }
      else if (mod && k === "s" && !e.shiftKey) { e.preventDefault(); files.save(); }
      else if (e.key === "F12") { e.preventDefault(); files.saveAs(); }
      else if (mod && k === "o") {
        e.preventDefault();
        if (isDesktop()) void openFileFromDisk().then((d) => d && openDoc(d)).catch((err) => toast(err instanceof Error ? err.message : "No se pudo abrir", "error"));
        else navigate({ name: "home", section: "open" });
      }
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
  }, [editor, focus, find, s, files, navigate, setPanelOpen, toast]);

  const editorStyle = {
    fontFamily: s.fontFamily,
    fontSize: `${s.fontSize}pt`,
    lineHeight: s.lineHeight,
    "--para-spacing": `${s.paraSpacing}em`,
    "--doc-font": s.fontFamily,
    "--page-pad-x": s.viewMode === "page" ? `${margin.h * MM_TO_PX}px` : "0px",
  } as React.CSSProperties;

  return (
    <div className="flex h-full flex-col bg-bg">
      {/* Barra de título */}
      <header
        data-tauri-drag-region
        className={cn(
          "no-print flex h-11 shrink-0 items-center gap-2 border-b border-border bg-surface px-2 transition-opacity",
          focus && "opacity-0 hover:opacity-100",
        )}
        style={{ paddingRight: "calc(var(--wc) + 8px)" }}
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
        {doc.filePath && (
          <Tooltip
            label={
              diskState === "error"
                ? `No se pudo guardar en ${doc.filePath}`
                : unsavedFile
                  ? autoSave
                    ? `Guardando en ${doc.filePath}…`
                    : `Cambios sin guardar en ${doc.filePath} (Ctrl+S)`
                  : `Guardado en ${doc.filePath} · clic para ver la carpeta`
            }
          >
            <button
              onClick={() => void revealInFolder(doc.filePath!).catch(() => {})}
              className="flex max-w-[220px] items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-muted hover:bg-surface-2 hover:text-text"
            >
              <FileText className="size-3.5 shrink-0" />
              <span className="truncate">{fileName(doc.filePath)}</span>
              {diskState === "saving" ? (
                <Loader2 className="size-3 shrink-0 animate-spin" aria-label="Guardando en el archivo" />
              ) : diskState === "error" ? (
                <span className="size-1.5 shrink-0 rounded-full bg-red-500" aria-label="Error al guardar en el archivo" />
              ) : (
                unsavedFile && <span className="size-1.5 shrink-0 rounded-full bg-amber-500" aria-label="Cambios sin guardar en el archivo" />
              )}
            </button>
          </Tooltip>
        )}
        <Tooltip label={doc.filePath ? "Guardar en el archivo (Ctrl+S)" : "Guardar en un archivo (Ctrl+S)"}>
          <Button size="sm" variant="outline" icon={<Save className="size-3.5" />} onClick={files.save}>
            {isDesktop() ? "Guardar" : "Descargar"}
          </Button>
        </Tooltip>
        <Button size="sm" variant={panelOpen ? "secondary" : "primary"} icon={<Sparkles className="size-3.5" />} onClick={() => setPanelOpen(!panelOpen)}>
          IA
        </Button>
      </header>

      {!focus && (
        <Ribbon editor={editor} files={files} layout={layoutActions} onFind={(replace) => setFind({ replace: !!replace })} onWordCount={() => setWordCount(true)} />
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
            <div style={{ zoom: s.zoom / 100 }} className={cn("zoom-wrap", s.viewMode === "page" ? "py-8" : "py-10")}>
              {s.viewMode === "page" ? (
                <div
                  ref={paperRef}
                  className="paged-doc relative isolate mx-auto"
                  style={{ width: pageW, padding: `0 ${margin.h * MM_TO_PX}px`, ...editorStyle }}
                  onMouseDown={(e) => {
                    if (e.target === e.currentTarget) {
                      e.preventDefault();
                      editor.commands.focus("end");
                    }
                  }}
                >
                  {/* Las hojas se dibujan detrás del texto */}
                  <div className="page-sheets pointer-events-none absolute inset-x-0 top-0 -z-10" aria-hidden>
                    {Array.from({ length: pages }, (_, i) => (
                      <div key={i} className="paper absolute inset-x-0" style={{ top: i * (pageH + PAGE_GAP), height: pageH }} />
                    ))}
                  </div>
                  <HfZone zone="header" height={mt} texts={firstTexts.header} onEdit={openHf} />
                  <EditorContent editor={editor} />
                  <div
                    className="last-page-filler"
                    style={{ height: Math.max(0, contentH - lastUsed) }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      editor.commands.focus("end");
                    }}
                  />
                  <HfZone zone="footer" height={mb} texts={lastTexts.footer} onEdit={openHf} />
                  {hfEdit && (
                    <HeaderFooterBar
                      key={`${hfEdit.zone}-${hfEdit.top}`}
                      zone={hfEdit.zone}
                      top={hfEdit.top}
                      height={hfEdit.zone === "header" ? mt : mb}
                      paddingX={margin.h * MM_TO_PX}
                      layout={doc.pageLayout}
                      onChange={saveLayout}
                      onClose={() => setHfEdit(null)}
                    />
                  )}
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
      <LinkBubble editor={editor} />
      {!focus && <StatusBar editor={editor} pages={pages} saveState={saveState} onWordCount={() => setWordCount(true)} />}
      <WordCountDialog editor={editor} open={wordCount} onOpenChange={setWordCount} pages={pages} />
    </div>
  );
}
