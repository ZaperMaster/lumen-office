import { usePreloadAI } from "@/components/ai/usePreloadAI";
import { useRef, useState, type ReactNode } from "react";
import type { Editor } from "@tiptap/react";
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, Baseline, Bold, CalendarDays, ChevronDown, ChevronUp, ClipboardPaste,
  Code, Copy, Eraser, FileCode2, FileDown, FileText, FileType2, Focus, Heading1, Highlighter, ImagePlus, IndentDecrease,
  IndentIncrease, Italic, Link2, List, ListChecks, ListOrdered, Maximize, Minus, Omega, PanelRight, Plus, Printer,
  Quote, Redo2, Replace, Rows3, ScanText, Scissors, Search, Sparkles, SpellCheck, SquareCode, Strikethrough, Subscript,
  Superscript, Table2, Type, Underline, Undo2, WholeWord, Smile, Columns3, Trash2, Merge, Split, PanelTop, ArrowUpToLine,
  ArrowDownToLine, ArrowLeftToLine, ArrowRightToLine, FileImage, Monitor, BookOpen, SeparatorHorizontal, CaseSensitive,
  Wand2, Languages, AlignVerticalSpaceAround, House, PanelBottom, Hash, Settings2, ListTree, MessageSquarePlus, FilePen, CheckCheck, XCircle, FilePlus2, StickyNote, Sheet, Presentation, Save, SaveAll, FolderOpen, FolderSearch, FileJson, ChartColumnBig, SquareDashedText, Columns2, TextQuote,
} from "lucide-react";
import { CALLOUTS, SAMPLE_CHART } from "@/components/editor/docBlocks";
import { ChartDialog } from "@/components/editor/DocChartView";
import { useEditorFlags, FontPicker, FontSizePicker, parsePt, stepSize, ColorButton, HIGHLIGHT_COLORS, TableGridPicker, StyleGallery } from "@/components/editor/controls";
import { AIActionsMenuContent } from "@/components/ai/AIActionsMenu";
import { useAI } from "@/components/ai/aiStore";
import { printDocument, ACCEPTED_IMPORTS } from "@/lib/io";
import { isDesktop, openFileFromDisk, revealInFolder } from "@/lib/files";
import type { FileFormat } from "@/lib/db";
import { newDocument, newNote, newSheet, newSlides, openDoc } from "@/lib/actions";
import { normalizeUrl } from "@/lib/openExternal";
import { PAGE_NUMBER_FORMATS, type Slot } from "@/lib/pageLayout";
import { MARGINS, PAGE_SIZES, useSettings, type Margins, type PageSize, type ViewMode } from "@/store/settings";
import { useApp } from "@/store/app";
import {
  Button, IconButton, Input, Menu, MenuCheckItem, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, Popover,
  PopoverClose, PopoverContent, PopoverTrigger, SubMenu, Tooltip, cn,
} from "@/components/ui";

import { L, uiLocale } from "@/lib/i18n";
type Tab = "home" | "insert" | "layout" | "review" | "view" | "ai" | "table";

/** Acciones de encabezado, pie y numeración que ofrece el documento. */
export interface LayoutActions {
  edit: (zone: "header" | "footer") => void;
  setPageNumber: (zone: "header" | "footer", slot: Slot, text: string) => void;
  removePageNumbers: () => void;
  hasPageNumbers: boolean;
}

/** Comentarios y control de cambios */
export interface ReviewActions {
  newComment: () => void;
  panelOpen: boolean;
  togglePanel: () => void;
  track: boolean;
  setTrack: (on: boolean) => void;
}

export interface RibbonProps {
  editor: Editor;
  files: FileActions;
  layout: LayoutActions;
  review: ReviewActions;
  onFind: (replace?: boolean) => void;
  onWordCount: () => void;
}

export function Ribbon({ editor, files, layout, review, onFind, onWordCount }: RibbonProps) {
  const flags = useEditorFlags(editor);
  const [tab, setTab] = useState<Tab>("home");
  const { ribbonCollapsed, set } = useSettings();
  const activeTab: Tab = tab === "table" && !flags.table ? "home" : tab;

  const tabs: { id: Tab; label: string; contextual?: boolean }[] = [
    { id: "home", label: L("Inicio") },
    { id: "insert", label: L("Insertar") },
    { id: "layout", label: L("Diseño") },
    { id: "review", label: L("Revisar") },
    { id: "view", label: L("Vista") },
    { id: "ai", label: L("IA") },
    ...(flags.table ? [{ id: "table" as Tab, label: L("Tabla"), contextual: true }] : []),
  ];

  return (
    <div className="no-print shrink-0 border-b border-border bg-surface">
      <div className="flex h-9 items-end gap-0.5 px-2">
        <FileMenu files={files} />
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setTab(t.id);
              if (ribbonCollapsed) set("ribbonCollapsed", false);
            }}
            className={cn(
              "relative h-8 rounded-t-md px-3.5 text-[13px] font-medium transition-colors",
              activeTab === t.id && !ribbonCollapsed ? "text-accent" : "text-muted hover:bg-surface-2 hover:text-text",
              t.contextual && "text-emerald-600",
              t.id === "ai" && "flex items-center gap-1.5",
            )}
          >
            {t.id === "ai" && <Sparkles className="size-3.5" />}
            {t.label}
            {activeTab === t.id && !ribbonCollapsed && <span className="absolute inset-x-2.5 bottom-0 h-[2.5px] rounded-full bg-accent" />}
          </button>
        ))}
        <div className="ml-auto pb-1">
          <IconButton size="sm" label={ribbonCollapsed ? L("Mostrar cinta") : L("Ocultar cinta")} onClick={() => set("ribbonCollapsed", !ribbonCollapsed)}>
            {ribbonCollapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
          </IconButton>
        </div>
      </div>
      {!ribbonCollapsed && (
        <div
          className="flex h-[92px] items-stretch overflow-x-auto overflow-y-hidden border-t border-border px-2 pt-1.5 pb-1"
          onWheel={(e) => {
            if (e.deltaY) e.currentTarget.scrollLeft += e.deltaY;
          }}
        >
          {activeTab === "home" && <HomeTab editor={editor} flags={flags} />}
          {activeTab === "insert" && <InsertTab editor={editor} layout={layout} />}
          {activeTab === "layout" && <LayoutTab editor={editor} />}
          {activeTab === "review" && <ReviewTab editor={editor} review={review} onFind={onFind} onWordCount={onWordCount} />}
          {activeTab === "view" && <ViewTab />}
          {activeTab === "ai" && <AITab editor={editor} />}
          {activeTab === "table" && <TableTab editor={editor} />}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Piezas comunes                                                     */
/* ------------------------------------------------------------------ */

function Group({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className="flex shrink-0 flex-col border-r border-border px-2.5 last:border-r-0">
      <div className={cn("flex flex-1 items-center gap-0.5", className)}>{children}</div>
      <div className="pt-0.5 text-center text-[10.5px] text-muted">{label}</div>
    </div>
  );
}

/** Botón grande con icono arriba y texto debajo. */
function Big({ icon, label, onClick, active, disabled, title }: { icon: ReactNode; label: string; onClick?: () => void; active?: boolean; disabled?: boolean; title?: string }) {
  const btn = (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-full min-w-[54px] flex-col items-center justify-center gap-1 rounded-md px-1.5 text-[11.5px] leading-tight transition-colors",
        active ? "bg-accent-soft text-accent" : "hover:bg-surface-2",
        "disabled:opacity-40",
      )}
    >
      <span className="[&>svg]:size-[22px]">{icon}</span>
      <span className="max-w-[72px] text-center">{label}</span>
    </button>
  );
  return title ? <Tooltip label={title}>{btn}</Tooltip> : btn;
}

const Col = ({ children }: { children: ReactNode }) => <div className="flex flex-col justify-center gap-0.5">{children}</div>;
const Row = ({ children }: { children: ReactNode }) => <div className="flex items-center gap-0.5">{children}</div>;
const I = (C: typeof Bold) => <C className="size-4" />;

/* ------------------------------------------------------------------ */
/*  Menú Archivo                                                       */
/* ------------------------------------------------------------------ */

export interface FileActions {
  /** Ruta del archivo vinculado, si lo hay */
  filePath: string | null;
  save: () => void;
  saveAs: () => void;
  exportAs: (format: FileFormat) => void;
  /** Guardar como PDF directamente */
  pdf: () => void;
}

function FileMenu({ files }: { files: FileActions }) {
  const navigate = useApp((s) => s.navigate);
  const toast = useApp((s) => s.toast);
  const fileRef = useRef<HTMLInputElement>(null);
  const desktop = isDesktop();

  const openFile = async () => {
    if (!desktop) return fileRef.current?.click();
    try {
      const doc = await openFileFromDisk();
      if (doc) openDoc(doc);
    } catch (e) {
      toast(e instanceof Error ? e.message : L("No se pudo abrir el archivo"), "error");
    }
  };

  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <button className="mb-0.5 h-7 rounded-md bg-accent px-3.5 text-[13px] font-semibold text-accent-fg hover:brightness-110">{L("Archivo")}</button>
        </MenuTrigger>
        <MenuContent className="w-[270px]">
          <MenuItem icon={<House />} onSelect={() => navigate({ name: "home" })}>{L("Inicio")}</MenuItem>
          <MenuSeparator />
          <MenuItem icon={<FilePlus2 />} onSelect={() => newDocument()}>{L("Nuevo documento")}</MenuItem>
          <MenuItem icon={<Sheet />} onSelect={() => newSheet()}>{L("Nueva hoja de cálculo")}</MenuItem>
          <MenuItem icon={<Presentation />} onSelect={() => newSlides()}>{L("Nueva presentación")}</MenuItem>
          <MenuItem icon={<StickyNote />} onSelect={() => newNote()}>{L("Nueva nota")}</MenuItem>
          <MenuItem icon={<FolderOpen />} shortcut="Ctrl+O" onSelect={openFile}>{L("Abrir archivo…")}</MenuItem>
          <MenuItem icon={<BookOpen />} onSelect={() => navigate({ name: "home", section: "open" })}>{L("Documentos recientes")}</MenuItem>
          <MenuSeparator />
          <MenuItem icon={<Save />} shortcut="Ctrl+S" onSelect={files.save}>
            {files.filePath ? L("Guardar") : desktop ? L("Guardar…") : L("Descargar (.docx)")}
          </MenuItem>
          {desktop && (
            <MenuItem icon={<SaveAll />} shortcut="F12" onSelect={files.saveAs}>{L("Guardar como…")}</MenuItem>
          )}
          <SubMenu label={L("Exportar una copia")} icon={<FileDown />}>
            <MenuItem icon={<FileText />} onSelect={() => files.exportAs("docx")}>{L("Word (.docx)")}</MenuItem>
            <MenuItem icon={<FileType2 />} onSelect={files.pdf}>{L("PDF (.pdf)")}</MenuItem>
            <MenuItem icon={<FileJson />} onSelect={() => files.exportAs("lumen")}>{L("Lumen, sin pérdidas (.lumen)")}</MenuItem>
            <MenuItem icon={<FileCode2 />} onSelect={() => files.exportAs("md")}>{L("Markdown (.md)")}</MenuItem>
            <MenuItem icon={<Monitor />} onSelect={() => files.exportAs("html")}>{L("Página web (.html)")}</MenuItem>
            <MenuItem icon={<Type />} onSelect={() => files.exportAs("txt")}>{L("Texto sin formato (.txt)")}</MenuItem>
          </SubMenu>
          <MenuItem icon={<FileType2 />} onSelect={files.pdf}>{L("Guardar como PDF…")}</MenuItem>
          <MenuItem icon={<Printer />} shortcut="Ctrl+P" onSelect={() => printDocument()}>{L("Imprimir…")}</MenuItem>
          {files.filePath && desktop && (
            <>
              <MenuSeparator />
              <MenuItem icon={<FolderSearch />} onSelect={() => void revealInFolder(files.filePath!)}>{L("Mostrar en la carpeta")}</MenuItem>
            </>
          )}
        </MenuContent>
      </Menu>
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPTED_IMPORTS}
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          try {
            const { importAnyFile } = await import("@/lib/officeImport");
            openDoc(await importAnyFile(f));
          } catch (err) {
            toast(err instanceof Error ? err.message : L("No se pudo abrir el archivo"), "error");
          }
        }}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Inicio                                                             */
/* ------------------------------------------------------------------ */

function HomeTab({ editor, flags }: { editor: Editor; flags: ReturnType<typeof useEditorFlags> }) {
  const { fontFamily, fontSize } = useSettings();
  const [textColor, setTextColor] = useState("#e03131");
  const [hlColor, setHlColor] = useState(HIGHLIGHT_COLORS[0]);
  const size = parsePt(flags.fontSize) ?? fontSize;
  const c = () => editor.chain().focus();
  const toast = useApp((s) => s.toast);

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      c().insertContent(text).run();
    } catch {
      toast(L("Usa Ctrl+V para pegar"), "info");
    }
  };

  return (
    <>
      <Group label={L("Portapapeles")}>
        <Big icon={<ClipboardPaste />} label={L("Pegar")} onClick={paste} title={L("Pegar (Ctrl+V)")} />
        <Col>
          <IconButton size="sm" label={L("Cortar")} shortcut="Ctrl+X" onClick={() => { editor.commands.focus(); document.execCommand("cut"); }}>{I(Scissors)}</IconButton>
          <IconButton size="sm" label={L("Copiar")} shortcut="Ctrl+C" onClick={() => { editor.commands.focus(); document.execCommand("copy"); }}>{I(Copy)}</IconButton>
        </Col>
        <Col>
          <IconButton size="sm" label={L("Deshacer")} shortcut="Ctrl+Z" disabled={!flags.canUndo} onClick={() => c().undo().run()}>{I(Undo2)}</IconButton>
          <IconButton size="sm" label={L("Rehacer")} shortcut="Ctrl+Y" disabled={!flags.canRedo} onClick={() => c().redo().run()}>{I(Redo2)}</IconButton>
        </Col>
      </Group>

      <Group label={L("Fuente")}>
        <Col>
          <Row>
            <FontPicker value={flags.fontFamily ?? fontFamily} onChange={(css) => c().setFontFamily(css).run()} />
            <FontSizePicker value={size} onChange={(pt) => c().setFontSize(`${pt}pt`).run()} />
            <IconButton size="sm" label={L("Aumentar tamaño")} shortcut="Ctrl+]" onClick={() => c().setFontSize(`${stepSize(size, 1)}pt`).run()}>
              <span className="text-[13px] font-semibold">A<sup>+</sup></span>
            </IconButton>
            <IconButton size="sm" label={L("Reducir tamaño")} shortcut="Ctrl+[" onClick={() => c().setFontSize(`${stepSize(size, -1)}pt`).run()}>
              <span className="text-[12px] font-semibold">A<sup>−</sup></span>
            </IconButton>
            <IconButton size="sm" label={L("Borrar formato")} onClick={() => c().unsetAllMarks().unsetFontFamily().unsetFontSize().run()}>{I(Eraser)}</IconButton>
          </Row>
          <Row>
            <IconButton size="sm" label={L("Negrita")} shortcut="Ctrl+B" active={flags.bold} onClick={() => c().toggleBold().run()}>{I(Bold)}</IconButton>
            <IconButton size="sm" label={L("Cursiva")} shortcut="Ctrl+I" active={flags.italic} onClick={() => c().toggleItalic().run()}>{I(Italic)}</IconButton>
            <IconButton size="sm" label={L("Subrayado")} shortcut="Ctrl+U" active={flags.underline} onClick={() => c().toggleUnderline().run()}>{I(Underline)}</IconButton>
            <IconButton size="sm" label={L("Tachado")} shortcut="Ctrl+Shift+S" active={flags.strike} onClick={() => c().toggleStrike().run()}>{I(Strikethrough)}</IconButton>
            <IconButton size="sm" label={L("Subíndice")} shortcut="Ctrl+," active={flags.subscript} onClick={() => c().toggleSubscript().run()}>{I(Subscript)}</IconButton>
            <IconButton size="sm" label={L("Superíndice")} shortcut="Ctrl+." active={flags.superscript} onClick={() => c().toggleSuperscript().run()}>{I(Superscript)}</IconButton>
            <IconButton size="sm" label={L("Código en línea")} shortcut="Ctrl+E" active={flags.code} onClick={() => c().toggleCode().run()}>{I(Code)}</IconButton>
            <ColorButton
              label={L("Color de resaltado")}
              icon={<Highlighter />}
              color={hlColor}
              colors={HIGHLIGHT_COLORS}
              clearLabel={L("Sin resaltado")}
              onApply={(col) => { setHlColor(col); c().toggleHighlight({ color: col }).run(); }}
              onClear={() => c().unsetHighlight().run()}
            />
            <ColorButton
              label={L("Color de fuente")}
              icon={<Baseline />}
              color={textColor}
              onApply={(col) => { setTextColor(col); c().setColor(col).run(); }}
              onClear={() => c().unsetColor().run()}
            />
          </Row>
        </Col>
      </Group>

      <Group label={L("Párrafo")}>
        <Col>
          <Row>
            <IconButton size="sm" label={L("Viñetas")} active={flags.bulletList} onClick={() => c().toggleBulletList().run()}>{I(List)}</IconButton>
            <IconButton size="sm" label={L("Numeración")} active={flags.orderedList} onClick={() => c().toggleOrderedList().run()}>{I(ListOrdered)}</IconButton>
            <IconButton size="sm" label={L("Lista de tareas")} active={flags.taskList} onClick={() => c().toggleTaskList().run()}>{I(ListChecks)}</IconButton>
            <IconButton size="sm" label={L("Disminuir sangría")} shortcut="Shift+Tab" onClick={() => (flags.bulletList || flags.orderedList || flags.taskList ? c().liftListItem(flags.taskList ? "taskItem" : "listItem").run() : c().outdent().run())}>{I(IndentDecrease)}</IconButton>
            <IconButton size="sm" label={L("Aumentar sangría")} shortcut={L("Tab")} onClick={() => (flags.bulletList || flags.orderedList || flags.taskList ? c().sinkListItem(flags.taskList ? "taskItem" : "listItem").run() : c().indent().run())}>{I(IndentIncrease)}</IconButton>
          </Row>
          <Row>
            <IconButton size="sm" label={L("Alinear a la izquierda")} shortcut="Ctrl+Shift+L" active={flags.alignLeft} onClick={() => c().setTextAlign("left").run()}>{I(AlignLeft)}</IconButton>
            <IconButton size="sm" label={L("Centrar")} shortcut="Ctrl+Shift+E" active={flags.alignCenter} onClick={() => c().setTextAlign("center").run()}>{I(AlignCenter)}</IconButton>
            <IconButton size="sm" label={L("Alinear a la derecha")} shortcut="Ctrl+Shift+R" active={flags.alignRight} onClick={() => c().setTextAlign("right").run()}>{I(AlignRight)}</IconButton>
            <IconButton size="sm" label={L("Justificar")} shortcut="Ctrl+Shift+J" active={flags.alignJustify} onClick={() => c().setTextAlign("justify").run()}>{I(AlignJustify)}</IconButton>
            <LineHeightMenu editor={editor} current={flags.lineHeight} />
            <IconButton size="sm" label={L("Cita")} active={flags.blockquote} onClick={() => c().toggleBlockquote().run()}>{I(Quote)}</IconButton>
          </Row>
        </Col>
      </Group>

      <Group label={L("Estilos")}>
        <StyleGallery editor={editor} flags={flags} />
      </Group>

      <Group label={L("IA")}>
        <Menu>
          <MenuTrigger asChild>
            <button className="flex h-full min-w-[60px] flex-col items-center justify-center gap-1 rounded-md px-1.5 text-[11.5px] hover:bg-surface-2">
              <span className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white">
                <Sparkles className="size-4" />
              </span>
              {L("Escribir con IA")}
            </button>
          </MenuTrigger>
          <AIActionsMenuContent editor={editor} />
        </Menu>
      </Group>
    </>
  );
}

function LineHeightMenu({ editor, current }: { editor: Editor; current: string | null }) {
  const values = ["1", "1.15", "1.5", "2", "2.5", "3"];
  return (
    <Menu>
      <Tooltip label={L("Interlineado")}>
        <MenuTrigger asChild>
          <button className="flex h-7 items-center rounded-md px-1 text-text hover:bg-surface-2" aria-label={L("Interlineado")}>
            <AlignVerticalSpaceAround className="size-4" />
            <ChevronDown className="size-3 text-muted" />
          </button>
        </MenuTrigger>
      </Tooltip>
      <MenuContent className="min-w-[150px]">
        <MenuLabel>{L("Interlineado")}</MenuLabel>
        {values.map((v) => (
          <MenuCheckItem key={v} checked={current === v} onSelect={() => editor.chain().focus().setParagraphLineHeight(v).run()}>
            {v.replace(".", ",")}
          </MenuCheckItem>
        ))}
        <MenuSeparator />
        <MenuItem onSelect={() => editor.chain().focus().setParagraphLineHeight(null).run()}>{L("Predeterminado")}</MenuItem>
      </MenuContent>
    </Menu>
  );
}

/* ------------------------------------------------------------------ */
/*  Insertar                                                           */
/* ------------------------------------------------------------------ */

const PAGE_NUMBER_POSITIONS: { label: string; zone: "header" | "footer"; slot: Slot }[] = [
  { label: L("Abajo · centro"), zone: "footer", slot: "center" },
  { label: L("Abajo · derecha"), zone: "footer", slot: "right" },
  { label: L("Abajo · izquierda"), zone: "footer", slot: "left" },
  { label: L("Arriba · derecha"), zone: "header", slot: "right" },
  { label: L("Arriba · centro"), zone: "header", slot: "center" },
  { label: L("Arriba · izquierda"), zone: "header", slot: "left" },
];

const SYMBOLS = "© ® ™ € £ ¥ ¢ $ ° ± × ÷ ≠ ≈ ≤ ≥ ∞ √ ∑ π Ω α β γ δ µ → ← ↑ ↓ ↔ ⇒ • · … — – « » ¿ ¡ § ¶ † ‡ ✓ ✗ ★ ☆ ♥ ♦ ♣ ♠ ½ ¼ ¾ ² ³ ‰".split(" ");
const EMOJIS = "😀 😂 😊 😍 🤔 😎 😢 😡 👍 👎 👏 🙏 💪 🎉 🔥 ✨ ⭐ 💡 📌 📎 📝 📅 ✅ ❌ ⚠️ ❤️ 💙 💚 🚀 🎯 📈 📉 💼 🏠 ☕ 🌍 🌞 🌙 ⏰ 📞 📧 🔗 🔒 🔑 🧠 🎵 📷 🛒".split(" ");

export function readImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function InsertTab({ editor, layout }: { editor: Editor; layout: LayoutActions }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const c = () => editor.chain().focus();
  const [imgUrl, setImgUrl] = useState("");
  const [chartOpen, setChartOpen] = useState(false);
  const toast = useApp((s) => s.toast);
  const now = new Date();

  /** Índice con los títulos del documento, en el sitio del cursor. */
  const insertToc = () => {
    const items: { level: number; text: string }[] = [];
    editor.state.doc.descendants((n) => {
      if (n.type.name === "heading" && n.textContent.trim()) items.push({ level: n.attrs.level as number, text: n.textContent.trim() });
    });
    if (!items.length) return toast(L("Primero pon títulos en el documento (estilos Título 1, 2 y 3) para crear el índice"));
    const min = Math.min(...items.map((i) => i.level));
    c()
      .insertContent([
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Índice" }] },
        ...items.map((i) => {
          const depth = i.level - min;
          const prefix = depth === 0 ? "" : depth === 1 ? "    " : "        ";
          return { type: "paragraph", content: [{ type: "text", text: prefix + i.text, ...(depth === 0 ? { marks: [{ type: "bold" }] } : {}) }] };
        }),
        { type: "horizontalRule" },
      ])
      .run();
    toast(L("Índice insertado. Si cambias los títulos, vuelve a insertarlo."), "success");
  };

  /** Portada al principio del documento, seguida de un salto de página. */
  const insertCover = () => {
    const userName = useSettings.getState().userName;
    editor
      .chain()
      .focus()
      .insertContentAt(0, [
        { type: "paragraph" },
        { type: "paragraph" },
        { type: "paragraph" },
        { type: "heading", attrs: { level: 1, textAlign: "center" }, content: [{ type: "text", text: L("Título del documento") }] },
        { type: "paragraph", attrs: { textAlign: "center" }, content: [{ type: "text", text: L("Subtítulo"), marks: [{ type: "italic" }] }] },
        { type: "paragraph" },
        { type: "paragraph" },
        { type: "paragraph", attrs: { textAlign: "center" }, content: [{ type: "text", text: userName || "Autor" }] },
        { type: "paragraph", attrs: { textAlign: "center" }, content: [{ type: "text", text: now.toLocaleDateString(uiLocale(), { day: "numeric", month: "long", year: "numeric" }) }] },
        { type: "pageBreak" },
      ])
      .run();
  };

  return (
    <>
      <Group label={L("Páginas")}>
        <Big icon={<BookOpen />} label={L("Portada")} onClick={insertCover} title={L("Añade una portada al principio del documento")} />
        <Big icon={<ListTree />} label={L("Índice")} onClick={insertToc} title={L("Tabla de contenido con los títulos del documento")} />
        <Big icon={<SeparatorHorizontal />} label={L("Salto de página")} onClick={() => c().setPageBreak().run()} title={L("Salto de página (Ctrl+Enter)")} />
        <Big icon={<Minus />} label={L("Línea horizontal")} onClick={() => c().setHorizontalRule().run()} />
      </Group>
      <Group label={L("Encabezado y pie")}>
        <Big icon={<PanelTop />} label={L("Encabezado")} onClick={() => layout.edit("header")} title={L("Texto en la parte de arriba de cada página")} />
        <Big icon={<PanelBottom />} label={L("Pie de página")} onClick={() => layout.edit("footer")} title={L("Texto en la parte de abajo de cada página")} />
        <Menu>
          <MenuTrigger asChild>
            <button className="flex h-full min-w-[54px] flex-col items-center justify-center gap-1 rounded-md px-1.5 text-[11.5px] hover:bg-surface-2">
              <Hash className="size-[22px]" />
              {L("Número de página")}
            </button>
          </MenuTrigger>
          <MenuContent className="w-[260px]">
            {PAGE_NUMBER_POSITIONS.map((p) => (
              <SubMenu key={p.label} label={p.label} icon={p.zone === "header" ? <ArrowUpToLine /> : <ArrowDownToLine />}>
                {PAGE_NUMBER_FORMATS.map((fmt) => (
                  <MenuItem key={fmt.id} onSelect={() => layout.setPageNumber(p.zone, p.slot, fmt.text)}>
                    {fmt.label}
                  </MenuItem>
                ))}
              </SubMenu>
            ))}
            <MenuSeparator />
            <MenuItem icon={<Settings2 />} onSelect={() => layout.edit("footer")}>{L("Formato y primera página…")}</MenuItem>
            <MenuItem icon={<Trash2 />} danger disabled={!layout.hasPageNumbers} onSelect={layout.removePageNumbers}>
              {L("Quitar números de página")}
            </MenuItem>
          </MenuContent>
        </Menu>
      </Group>
      <Group label={L("Tablas")}>
        <Popover>
          <PopoverTrigger asChild>
            <button className="flex h-full min-w-[54px] flex-col items-center justify-center gap-1 rounded-md px-1.5 text-[11.5px] hover:bg-surface-2">
              <Table2 className="size-[22px]" />
              {L("Tabla")}
            </button>
          </PopoverTrigger>
          <PopoverContent>
            <TableGridPicker onPick={(rows, cols) => c().insertTable({ rows, cols, withHeaderRow: true }).run()} />
          </PopoverContent>
        </Popover>
      </Group>
      <Group label={L("Ilustraciones")}>
        <Big icon={<ImagePlus />} label={L("Imagen")} onClick={() => fileRef.current?.click()} title={L("Insertar imagen desde el equipo")} />
        <Popover>
          <PopoverTrigger asChild>
            <button className="flex h-full min-w-[54px] flex-col items-center justify-center gap-1 rounded-md px-1.5 text-[11.5px] hover:bg-surface-2">
              <FileImage className="size-[22px]" />
              {L("Imagen web")}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[320px]">
            <div className="mb-2 text-[12.5px] font-medium">{L("Insertar imagen desde una URL")}</div>
            <div className="flex gap-2">
              <Input value={imgUrl} onChange={(e) => setImgUrl(e.target.value)} placeholder="https://…" />
              <PopoverClose asChild>
                <Button variant="primary" onClick={() => { if (imgUrl) c().setImage({ src: imgUrl }).run(); setImgUrl(""); }}>{L("Insertar")}</Button>
              </PopoverClose>
            </div>
          </PopoverContent>
        </Popover>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) c().setImage({ src: await readImageFile(f), alt: f.name }).run();
          }}
        />
      </Group>
      <Group label={L("Elementos")}>
        <Big icon={<ChartColumnBig />} label={L("Gráfico")} onClick={() => setChartOpen(true)} title={L("Gráfico de columnas, barras, líneas o circular con tus datos")} />
        <Menu>
          <MenuTrigger asChild>
            <button className="flex h-full min-w-[54px] flex-col items-center justify-center gap-1 rounded-md px-1.5 text-[11.5px] hover:bg-surface-2">
              <SquareDashedText className="size-[22px]" />
              {L("Cuadro de texto")}
            </button>
          </MenuTrigger>
          <MenuContent>
            {CALLOUTS.map((k) => (
              <MenuItem key={k.id} onSelect={() => c().setCallout(k.id).run()}>
                <span className="mr-2 inline-block size-3.5 rounded-sm border-2" style={{ background: `#${k.fill}`, borderColor: `#${k.border}` }} />
                {k.label}
              </MenuItem>
            ))}
            <MenuSeparator />
            <MenuItem icon={<Trash2 />} disabled={!editor.isActive("callout")} onSelect={() => c().unsetCallout().run()}>{L("Quitar el cuadro")}</MenuItem>
          </MenuContent>
        </Menu>
        <Big icon={<TextQuote />} label={L("Nota al pie")} onClick={() => c().insertFootnote().run()} title={L("Nota numerada que aparece al final del documento (en Word, al pie de la página)")} />
        {chartOpen && <ChartDialog insert initial={SAMPLE_CHART} onClose={() => setChartOpen(false)} onSave={(ch) => c().insertDocChart(ch).run()} />}
      </Group>
      <Group label={L("Vínculos")}>
        <LinkButton editor={editor} big />
      </Group>
      <Group label={L("Texto")}>
        <Big icon={<SquareCode />} label={L("Bloque de código")} onClick={() => c().toggleCodeBlock().run()} />
        <Big icon={<Quote />} label={L("Cita")} onClick={() => c().toggleBlockquote().run()} />
        <Menu>
          <MenuTrigger asChild>
            <button className="flex h-full min-w-[54px] flex-col items-center justify-center gap-1 rounded-md px-1.5 text-[11.5px] hover:bg-surface-2">
              <CalendarDays className="size-[22px]" />
              {L("Fecha y hora")}
            </button>
          </MenuTrigger>
          <MenuContent>
            {[
              now.toLocaleDateString(uiLocale()),
              now.toLocaleDateString(uiLocale(), { day: "numeric", month: "long", year: "numeric" }),
              now.toLocaleDateString(uiLocale(), { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
              now.toLocaleTimeString(uiLocale(), { hour: "2-digit", minute: "2-digit" }),
              now.toLocaleString(uiLocale()),
            ].map((f) => (
              <MenuItem key={f} onSelect={() => c().insertContent(f).run()}>{f}</MenuItem>
            ))}
          </MenuContent>
        </Menu>
      </Group>
      <Group label={L("Símbolos")}>
        <CharGrid icon={<Omega className="size-[22px]" />} label={L("Símbolo")} chars={SYMBOLS} onPick={(s) => c().insertContent(s).run()} />
        <CharGrid icon={<Smile className="size-[22px]" />} label={L("Emoji")} chars={EMOJIS} onPick={(s) => c().insertContent(s).run()} />
      </Group>
    </>
  );
}

function CharGrid({ icon, label, chars, onPick }: { icon: ReactNode; label: string; chars: string[]; onPick: (s: string) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex h-full min-w-[54px] flex-col items-center justify-center gap-1 rounded-md px-1.5 text-[11.5px] hover:bg-surface-2">
          {icon}
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px]">
        <div className="grid grid-cols-10 gap-0.5">
          {chars.map((s) => (
            <button key={s} onClick={() => onPick(s)} className="grid size-7 place-items-center rounded text-[16px] hover:bg-surface-2">
              {s}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function LinkButton({ editor, big }: { editor: Editor; big?: boolean }) {
  const [url, setUrl] = useState("");
  const [open, setOpen] = useState(false);
  const apply = () => {
    const href = normalizeUrl(url);
    if (!href) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else if (editor.state.selection.empty && !editor.isActive("link")) {
      editor.chain().focus().insertContent({ type: "text", text: href, marks: [{ type: "link", attrs: { href } }] }).run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    setOpen(false);
  };
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setUrl((editor.getAttributes("link").href as string) ?? "");
      }}
    >
      <PopoverTrigger asChild>
        {big ? (
          <button className="flex h-full min-w-[54px] flex-col items-center justify-center gap-1 rounded-md px-1.5 text-[11.5px] hover:bg-surface-2">
            <Link2 className="size-[22px]" />
            {L("Vínculo")}
          </button>
        ) : (
          <button className={cn("grid h-7 w-7 place-items-center rounded-md hover:bg-surface-2", editor.isActive("link") && "bg-accent-soft text-accent")} aria-label={L("Vínculo")}>
            <Link2 className="size-4" />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-[340px]">
        <div className="mb-2 text-[12.5px] font-medium">{L("Dirección del vínculo")}</div>
        <div className="flex gap-2">
          <Input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && apply()} placeholder="https://ejemplo.com" />
          <Button variant="primary" onClick={apply}>{L("Aplicar")}</Button>
        </div>
        {editor.isActive("link") && (
          <button onClick={() => { editor.chain().focus().extendMarkRange("link").unsetLink().run(); setOpen(false); }} className="mt-2 text-[12px] text-red-500 hover:underline">
            {L("Quitar vínculo")}
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

/* ------------------------------------------------------------------ */
/*  Diseño                                                             */
/* ------------------------------------------------------------------ */

function LayoutTab({ editor }: { editor: Editor }) {
  const s = useSettings();
  return (
    <>
      <Group label={L("Configurar página")}>
        <Menu>
          <MenuTrigger asChild>
            <button className="flex h-full min-w-[54px] flex-col items-center justify-center gap-1 rounded-md px-1.5 text-[11.5px] hover:bg-surface-2">
              <Rows3 className="size-[22px]" />
              {L("Márgenes")}
            </button>
          </MenuTrigger>
          <MenuContent>
            {(Object.keys(MARGINS) as Margins[]).map((m) => (
              <MenuCheckItem key={m} checked={s.margins === m} onSelect={() => s.set("margins", m)}>{MARGINS[m].label}</MenuCheckItem>
            ))}
          </MenuContent>
        </Menu>
        <Menu>
          <MenuTrigger asChild>
            <button className="flex h-full min-w-[54px] flex-col items-center justify-center gap-1 rounded-md px-1.5 text-[11.5px] hover:bg-surface-2">
              <FileText className="size-[22px]" />
              {L("Tamaño")}
            </button>
          </MenuTrigger>
          <MenuContent>
            {(Object.keys(PAGE_SIZES) as PageSize[]).map((p) => (
              <MenuCheckItem key={p} checked={s.pageSize === p} onSelect={() => s.set("pageSize", p)}>{PAGE_SIZES[p].label}</MenuCheckItem>
            ))}
          </MenuContent>
        </Menu>
        <Big
          icon={<FileText className={cn(s.orientation === "landscape" && "rotate-90")} />}
          label={s.orientation === "portrait" ? L("Vertical") : L("Horizontal")}
          onClick={() => s.set("orientation", s.orientation === "portrait" ? "landscape" : "portrait")}
          title={L("Cambiar orientación")}
        />
        <Big icon={<SeparatorHorizontal />} label={L("Salto")} onClick={() => editor.chain().focus().setPageBreak().run()} title={L("Insertar salto de página")} />
        <Menu>
          <MenuTrigger asChild>
            <button className="flex h-full min-w-[54px] flex-col items-center justify-center gap-1 rounded-md px-1.5 text-[11.5px] hover:bg-surface-2" title={L("Sin texto seleccionado se aplica a todo el documento")}>
              <Columns2 className="size-[22px]" />
              {L("Columnas")}
            </button>
          </MenuTrigger>
          <MenuContent>
            {[1, 2, 3].map((n) => (
              <MenuCheckItem key={n} checked={(editor.isActive("columns") ? (editor.getAttributes("columns").count as number) : 1) === n} onSelect={() => editor.chain().focus().setColumns(n).run()}>
                {n === 1 ? L("Una") : n === 2 ? L("Dos") : L("Tres")}
              </MenuCheckItem>
            ))}
          </MenuContent>
        </Menu>
      </Group>
      <Group label={L("Texto predeterminado")}>
        <Col>
          <Row>
            <FontPicker value={s.fontFamily} onChange={(css) => s.set("fontFamily", css)} className="w-[160px]" />
            <FontSizePicker value={s.fontSize} onChange={(pt) => s.set("fontSize", pt)} />
          </Row>
          <Row>
            <span className="px-1 text-[11.5px] text-muted">{L("Interlineado")}</span>
            <select value={s.lineHeight} onChange={(e) => s.set("lineHeight", Number(e.target.value))} className="h-7 rounded-md border border-border bg-surface px-1.5 text-[12.5px]">
              {[1, 1.15, 1.3, 1.5, 1.75, 2].map((v) => <option key={v} value={v}>{String(v).replace(".", ",")}</option>)}
            </select>
            <span className="px-1 text-[11.5px] text-muted">{L("Espaciado")}</span>
            <select value={s.paraSpacing} onChange={(e) => s.set("paraSpacing", Number(e.target.value))} className="h-7 rounded-md border border-border bg-surface px-1.5 text-[12.5px]">
              {[0, 0.3, 0.6, 1, 1.5].map((v) => <option key={v} value={v}>{v === 0 ? L("Ninguno") : L("{0} líneas", String(v).replace(".", ","))}</option>)}
            </select>
          </Row>
        </Col>
      </Group>
      <Group label={L("Fondo")}>
        <Big
          icon={<PanelTop />}
          label={s.paperMode === "white" ? L("Hoja blanca") : L("Color del tema")}
          onClick={() => s.set("paperMode", s.paperMode === "white" ? "theme" : "white")}
          title={L("Alternar entre hoja blanca y el color del tema")}
        />
      </Group>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Revisar                                                            */
/* ------------------------------------------------------------------ */

function ReviewTab({ editor, review, onFind, onWordCount }: { editor: Editor; review: ReviewActions; onFind: (replace?: boolean) => void; onWordCount: () => void }) {
  const { spellcheck, set, smartTyping } = useSettings();
  const run = useAI((s) => s.run);
  return (
    <>
      <Group label={L("Buscar")}>
        <Big icon={<Search />} label={L("Buscar")} onClick={() => onFind(false)} title={L("Buscar (Ctrl+F)")} />
        <Big icon={<Replace />} label={L("Reemplazar")} onClick={() => onFind(true)} title={L("Reemplazar (Ctrl+H)")} />
      </Group>
      <Group label={L("Revisión")}>
        <Big icon={<SpellCheck />} label={L("Ortografía")} active={spellcheck} onClick={() => set("spellcheck", !spellcheck)} title={L("Subrayar errores ortográficos")} />
        <Big icon={<CaseSensitive />} label={L("Autoformato")} active={smartTyping} onClick={() => set("smartTyping", !smartTyping)} title={L("Comillas tipográficas, guiones y símbolos automáticos")} />
        <Big icon={<WholeWord />} label={L("Contar palabras")} onClick={onWordCount} />
      </Group>
      <Group label={L("Comentarios")}>
        <Big icon={<MessageSquarePlus />} label={L("Nuevo comentario")} onClick={review.newComment} title={L("Comenta el texto seleccionado")} />
        <Big icon={<PanelRight />} label={L("Panel de revisión")} active={review.panelOpen} onClick={review.togglePanel} title={L("Comentarios y cambios propuestos")} />
      </Group>
      <Group label={L("Seguimiento")}>
        <Big icon={<FilePen />} label={L("Control de cambios")} active={review.track} onClick={() => review.setTrack(!review.track)} title={L("Lo que escribas o borres queda marcado para aceptarlo o rechazarlo")} />
        <Big icon={<CheckCheck />} label={L("Aceptar todo")} onClick={() => editor.chain().focus().acceptAllChanges().run()} />
        <Big icon={<XCircle />} label={L("Rechazar todo")} onClick={() => editor.chain().focus().rejectAllChanges().run()} />
      </Group>
      <Group label={L("Revisión con IA")}>
        <Big icon={<Wand2 />} label={L("Corregir")} onClick={() => run(editor, "fix")} title={L("Corrige ortografía y gramática del texto seleccionado")} />
        <Big icon={<ScanText />} label={L("Mejorar")} onClick={() => run(editor, "improve")} title={L("Mejora la redacción del texto seleccionado")} />
        <Menu>
          <MenuTrigger asChild>
            <button className="flex h-full min-w-[54px] flex-col items-center justify-center gap-1 rounded-md px-1.5 text-[11.5px] hover:bg-surface-2">
              <Languages className="size-[22px]" />
              {L("Traducir")}
            </button>
          </MenuTrigger>
          <MenuContent>
            {["inglés", "español", "francés", "alemán", "italiano", "portugués"].map((l) => (
              <MenuItem key={l} onSelect={() => run(editor, "translate", l)}>{l[0].toUpperCase() + l.slice(1)}</MenuItem>
            ))}
          </MenuContent>
        </Menu>
      </Group>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Vista                                                              */
/* ------------------------------------------------------------------ */

function ViewTab() {
  const s = useSettings();
  const { panelOpen, setPanelOpen } = useAI();
  const modes: { id: ViewMode; label: string; icon: ReactNode }[] = [
    { id: "page", label: L("Diseño de impresión"), icon: <FileText /> },
    { id: "web", label: L("Diseño web"), icon: <Monitor /> },
    { id: "focus", label: L("Modo enfoque"), icon: <Focus /> },
  ];
  const zoomTo = (z: number) => s.set("zoom", Math.max(50, Math.min(200, z)));
  return (
    <>
      <Group label={L("Vistas")}>
        {modes.map((m) => (
          <Big key={m.id} icon={m.icon} label={m.label} active={s.viewMode === m.id} onClick={() => s.set("viewMode", m.id)} />
        ))}
      </Group>
      <Group label={L("Zoom")}>
        <Big icon={<Minus />} label={L("Alejar")} onClick={() => zoomTo(s.zoom - 10)} />
        <Big icon={<span className="text-[15px] font-semibold">100%</span>} label={L("Restablecer")} onClick={() => zoomTo(100)} />
        <Big icon={<Plus />} label={L("Acercar")} onClick={() => zoomTo(s.zoom + 10)} />
      </Group>
      <Group label={L("Ventana")}>
        <Big icon={<PanelRight />} label={L("Panel de IA")} active={panelOpen} onClick={() => setPanelOpen(!panelOpen)} />
        <Big
          icon={<Maximize />}
          label={L("Pantalla completa")}
          onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen())}
          title={L("Pantalla completa (F11)")}
        />
      </Group>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  IA                                                                 */
/* ------------------------------------------------------------------ */

function AITab({ editor }: { editor: Editor }) {
  usePreloadAI();
  const { run, setPanelOpen, panelOpen } = useAI();
  return (
    <>
      <Group label={L("Asistente")}>
        <Big
          icon={<span className="grid size-[26px] place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white"><Sparkles className="size-4" /></span>}
          label={L("Chat con IA")}
          active={panelOpen}
          onClick={() => setPanelOpen(!panelOpen)}
        />
        <Menu>
          <MenuTrigger asChild>
            <button className="flex h-full min-w-[54px] flex-col items-center justify-center gap-1 rounded-md px-1.5 text-[11.5px] hover:bg-surface-2">
              <Wand2 className="size-[22px]" />
              {L("Todas las acciones")}
            </button>
          </MenuTrigger>
          <AIActionsMenuContent editor={editor} />
        </Menu>
      </Group>
      <Group label={L("Editar selección")}>
        <Big icon={<Wand2 />} label={L("Mejorar")} onClick={() => run(editor, "improve")} />
        <Big icon={<SpellCheck />} label={L("Corregir")} onClick={() => run(editor, "fix")} />
        <Big icon={<Scissors />} label={L("Acortar")} onClick={() => run(editor, "shorter")} />
        <Big icon={<Plus />} label={L("Ampliar")} onClick={() => run(editor, "longer")} />
      </Group>
      <Group label={L("Generar")}>
        <Big icon={<Heading1 />} label={L("Resumir")} onClick={() => run(editor, "summarize")} />
        <Big icon={<ListChecks />} label={L("En lista")} onClick={() => run(editor, "bullets")} />
        <Big icon={<Table2 />} label={L("En tabla")} onClick={() => run(editor, "table")} />
        <Big icon={<Sparkles />} label={L("Continuar")} onClick={() => run(editor, "continue")} />
      </Group>
      <div className="flex items-center px-3 text-[12px] leading-snug text-muted">
        {L("Selecciona texto y elige una acción.")}
        <br />
        {L("Verás el resultado antes de aplicarlo.")}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Tabla (contextual)                                                 */
/* ------------------------------------------------------------------ */

function TableTab({ editor }: { editor: Editor }) {
  const c = () => editor.chain().focus();
  return (
    <>
      <Group label={L("Filas")}>
        <Big icon={<ArrowUpToLine />} label={L("Insertar arriba")} onClick={() => c().addRowBefore().run()} />
        <Big icon={<ArrowDownToLine />} label={L("Insertar debajo")} onClick={() => c().addRowAfter().run()} />
        <Big icon={<Trash2 />} label={L("Eliminar fila")} onClick={() => c().deleteRow().run()} />
      </Group>
      <Group label={L("Columnas")}>
        <Big icon={<ArrowLeftToLine />} label={L("Insertar a la izq.")} onClick={() => c().addColumnBefore().run()} />
        <Big icon={<ArrowRightToLine />} label={L("Insertar a la der.")} onClick={() => c().addColumnAfter().run()} />
        <Big icon={<Trash2 />} label={L("Eliminar columna")} onClick={() => c().deleteColumn().run()} />
      </Group>
      <Group label={L("Celdas")}>
        <Big icon={<Merge />} label={L("Combinar")} onClick={() => c().mergeCells().run()} />
        <Big icon={<Split />} label={L("Dividir")} onClick={() => c().splitCell().run()} />
        <Big icon={<Columns3 />} label={L("Fila de encabezado")} onClick={() => c().toggleHeaderRow().run()} />
      </Group>
      <Group label={L("Tabla")}>
        <Big icon={<Trash2 className="text-red-500" />} label={L("Eliminar tabla")} onClick={() => c().deleteTable().run()} />
      </Group>
    </>
  );
}
