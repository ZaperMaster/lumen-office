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
  Wand2, Languages, AlignVerticalSpaceAround, House, PanelBottom, Hash, Settings2, FilePlus2, StickyNote, Sheet, Presentation, Save, SaveAll, FolderOpen, FolderSearch, FileJson,
} from "lucide-react";
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

type Tab = "home" | "insert" | "layout" | "review" | "view" | "ai" | "table";

/** Acciones de encabezado, pie y numeración que ofrece el documento. */
export interface LayoutActions {
  edit: (zone: "header" | "footer") => void;
  setPageNumber: (zone: "header" | "footer", slot: Slot, text: string) => void;
  removePageNumbers: () => void;
  hasPageNumbers: boolean;
}

export interface RibbonProps {
  editor: Editor;
  files: FileActions;
  layout: LayoutActions;
  onFind: (replace?: boolean) => void;
  onWordCount: () => void;
}

export function Ribbon({ editor, files, layout, onFind, onWordCount }: RibbonProps) {
  const flags = useEditorFlags(editor);
  const [tab, setTab] = useState<Tab>("home");
  const { ribbonCollapsed, set } = useSettings();
  const activeTab: Tab = tab === "table" && !flags.table ? "home" : tab;

  const tabs: { id: Tab; label: string; contextual?: boolean }[] = [
    { id: "home", label: "Inicio" },
    { id: "insert", label: "Insertar" },
    { id: "layout", label: "Diseño" },
    { id: "review", label: "Revisar" },
    { id: "view", label: "Vista" },
    { id: "ai", label: "IA" },
    ...(flags.table ? [{ id: "table" as Tab, label: "Tabla", contextual: true }] : []),
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
          <IconButton size="sm" label={ribbonCollapsed ? "Mostrar cinta" : "Ocultar cinta"} onClick={() => set("ribbonCollapsed", !ribbonCollapsed)}>
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
          {activeTab === "review" && <ReviewTab editor={editor} onFind={onFind} onWordCount={onWordCount} />}
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
      toast(e instanceof Error ? e.message : "No se pudo abrir el archivo", "error");
    }
  };

  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <button className="mb-0.5 h-7 rounded-md bg-accent px-3.5 text-[13px] font-semibold text-accent-fg hover:brightness-110">Archivo</button>
        </MenuTrigger>
        <MenuContent className="w-[270px]">
          <MenuItem icon={<House />} onSelect={() => navigate({ name: "home" })}>Inicio</MenuItem>
          <MenuSeparator />
          <MenuItem icon={<FilePlus2 />} onSelect={() => newDocument()}>Nuevo documento</MenuItem>
          <MenuItem icon={<Sheet />} onSelect={() => newSheet()}>Nueva hoja de cálculo</MenuItem>
          <MenuItem icon={<Presentation />} onSelect={() => newSlides()}>Nueva presentación</MenuItem>
          <MenuItem icon={<StickyNote />} onSelect={() => newNote()}>Nueva nota</MenuItem>
          <MenuItem icon={<FolderOpen />} shortcut="Ctrl+O" onSelect={openFile}>Abrir archivo…</MenuItem>
          <MenuItem icon={<BookOpen />} onSelect={() => navigate({ name: "home", section: "open" })}>Documentos recientes</MenuItem>
          <MenuSeparator />
          <MenuItem icon={<Save />} shortcut="Ctrl+S" onSelect={files.save}>
            {files.filePath ? "Guardar" : desktop ? "Guardar…" : "Descargar (.docx)"}
          </MenuItem>
          {desktop && (
            <MenuItem icon={<SaveAll />} shortcut="F12" onSelect={files.saveAs}>Guardar como…</MenuItem>
          )}
          <SubMenu label="Exportar una copia" icon={<FileDown />}>
            <MenuItem icon={<FileText />} onSelect={() => files.exportAs("docx")}>Word (.docx)</MenuItem>
            <MenuItem icon={<FileType2 />} onSelect={() => printDocument()}>PDF (mediante Imprimir)</MenuItem>
            <MenuItem icon={<FileJson />} onSelect={() => files.exportAs("lumen")}>Lumen, sin pérdidas (.lumen)</MenuItem>
            <MenuItem icon={<FileCode2 />} onSelect={() => files.exportAs("md")}>Markdown (.md)</MenuItem>
            <MenuItem icon={<Monitor />} onSelect={() => files.exportAs("html")}>Página web (.html)</MenuItem>
            <MenuItem icon={<Type />} onSelect={() => files.exportAs("txt")}>Texto sin formato (.txt)</MenuItem>
          </SubMenu>
          <MenuItem icon={<Printer />} shortcut="Ctrl+P" onSelect={() => printDocument()}>Imprimir…</MenuItem>
          {files.filePath && desktop && (
            <>
              <MenuSeparator />
              <MenuItem icon={<FolderSearch />} onSelect={() => void revealInFolder(files.filePath!)}>Mostrar en la carpeta</MenuItem>
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
            toast(`«${f.name}» abierto`, "success");
          } catch (err) {
            toast(err instanceof Error ? err.message : "No se pudo abrir el archivo", "error");
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
      toast("Usa Ctrl+V para pegar", "info");
    }
  };

  return (
    <>
      <Group label="Portapapeles">
        <Big icon={<ClipboardPaste />} label="Pegar" onClick={paste} title="Pegar (Ctrl+V)" />
        <Col>
          <IconButton size="sm" label="Cortar" shortcut="Ctrl+X" onClick={() => { editor.commands.focus(); document.execCommand("cut"); }}>{I(Scissors)}</IconButton>
          <IconButton size="sm" label="Copiar" shortcut="Ctrl+C" onClick={() => { editor.commands.focus(); document.execCommand("copy"); }}>{I(Copy)}</IconButton>
        </Col>
        <Col>
          <IconButton size="sm" label="Deshacer" shortcut="Ctrl+Z" disabled={!flags.canUndo} onClick={() => c().undo().run()}>{I(Undo2)}</IconButton>
          <IconButton size="sm" label="Rehacer" shortcut="Ctrl+Y" disabled={!flags.canRedo} onClick={() => c().redo().run()}>{I(Redo2)}</IconButton>
        </Col>
      </Group>

      <Group label="Fuente">
        <Col>
          <Row>
            <FontPicker value={flags.fontFamily ?? fontFamily} onChange={(css) => c().setFontFamily(css).run()} />
            <FontSizePicker value={size} onChange={(pt) => c().setFontSize(`${pt}pt`).run()} />
            <IconButton size="sm" label="Aumentar tamaño" shortcut="Ctrl+]" onClick={() => c().setFontSize(`${stepSize(size, 1)}pt`).run()}>
              <span className="text-[13px] font-semibold">A<sup>+</sup></span>
            </IconButton>
            <IconButton size="sm" label="Reducir tamaño" shortcut="Ctrl+[" onClick={() => c().setFontSize(`${stepSize(size, -1)}pt`).run()}>
              <span className="text-[12px] font-semibold">A<sup>−</sup></span>
            </IconButton>
            <IconButton size="sm" label="Borrar formato" onClick={() => c().unsetAllMarks().unsetFontFamily().unsetFontSize().run()}>{I(Eraser)}</IconButton>
          </Row>
          <Row>
            <IconButton size="sm" label="Negrita" shortcut="Ctrl+B" active={flags.bold} onClick={() => c().toggleBold().run()}>{I(Bold)}</IconButton>
            <IconButton size="sm" label="Cursiva" shortcut="Ctrl+I" active={flags.italic} onClick={() => c().toggleItalic().run()}>{I(Italic)}</IconButton>
            <IconButton size="sm" label="Subrayado" shortcut="Ctrl+U" active={flags.underline} onClick={() => c().toggleUnderline().run()}>{I(Underline)}</IconButton>
            <IconButton size="sm" label="Tachado" shortcut="Ctrl+Shift+S" active={flags.strike} onClick={() => c().toggleStrike().run()}>{I(Strikethrough)}</IconButton>
            <IconButton size="sm" label="Subíndice" shortcut="Ctrl+," active={flags.subscript} onClick={() => c().toggleSubscript().run()}>{I(Subscript)}</IconButton>
            <IconButton size="sm" label="Superíndice" shortcut="Ctrl+." active={flags.superscript} onClick={() => c().toggleSuperscript().run()}>{I(Superscript)}</IconButton>
            <IconButton size="sm" label="Código en línea" shortcut="Ctrl+E" active={flags.code} onClick={() => c().toggleCode().run()}>{I(Code)}</IconButton>
            <ColorButton
              label="Color de resaltado"
              icon={<Highlighter />}
              color={hlColor}
              colors={HIGHLIGHT_COLORS}
              clearLabel="Sin resaltado"
              onApply={(col) => { setHlColor(col); c().toggleHighlight({ color: col }).run(); }}
              onClear={() => c().unsetHighlight().run()}
            />
            <ColorButton
              label="Color de fuente"
              icon={<Baseline />}
              color={textColor}
              onApply={(col) => { setTextColor(col); c().setColor(col).run(); }}
              onClear={() => c().unsetColor().run()}
            />
          </Row>
        </Col>
      </Group>

      <Group label="Párrafo">
        <Col>
          <Row>
            <IconButton size="sm" label="Viñetas" active={flags.bulletList} onClick={() => c().toggleBulletList().run()}>{I(List)}</IconButton>
            <IconButton size="sm" label="Numeración" active={flags.orderedList} onClick={() => c().toggleOrderedList().run()}>{I(ListOrdered)}</IconButton>
            <IconButton size="sm" label="Lista de tareas" active={flags.taskList} onClick={() => c().toggleTaskList().run()}>{I(ListChecks)}</IconButton>
            <IconButton size="sm" label="Disminuir sangría" shortcut="Shift+Tab" onClick={() => (flags.bulletList || flags.orderedList || flags.taskList ? c().liftListItem(flags.taskList ? "taskItem" : "listItem").run() : c().outdent().run())}>{I(IndentDecrease)}</IconButton>
            <IconButton size="sm" label="Aumentar sangría" shortcut="Tab" onClick={() => (flags.bulletList || flags.orderedList || flags.taskList ? c().sinkListItem(flags.taskList ? "taskItem" : "listItem").run() : c().indent().run())}>{I(IndentIncrease)}</IconButton>
          </Row>
          <Row>
            <IconButton size="sm" label="Alinear a la izquierda" shortcut="Ctrl+Shift+L" active={flags.alignLeft} onClick={() => c().setTextAlign("left").run()}>{I(AlignLeft)}</IconButton>
            <IconButton size="sm" label="Centrar" shortcut="Ctrl+Shift+E" active={flags.alignCenter} onClick={() => c().setTextAlign("center").run()}>{I(AlignCenter)}</IconButton>
            <IconButton size="sm" label="Alinear a la derecha" shortcut="Ctrl+Shift+R" active={flags.alignRight} onClick={() => c().setTextAlign("right").run()}>{I(AlignRight)}</IconButton>
            <IconButton size="sm" label="Justificar" shortcut="Ctrl+Shift+J" active={flags.alignJustify} onClick={() => c().setTextAlign("justify").run()}>{I(AlignJustify)}</IconButton>
            <LineHeightMenu editor={editor} current={flags.lineHeight} />
            <IconButton size="sm" label="Cita" active={flags.blockquote} onClick={() => c().toggleBlockquote().run()}>{I(Quote)}</IconButton>
          </Row>
        </Col>
      </Group>

      <Group label="Estilos">
        <StyleGallery editor={editor} flags={flags} />
      </Group>

      <Group label="IA">
        <Menu>
          <MenuTrigger asChild>
            <button className="flex h-full min-w-[60px] flex-col items-center justify-center gap-1 rounded-md px-1.5 text-[11.5px] hover:bg-surface-2">
              <span className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white">
                <Sparkles className="size-4" />
              </span>
              Escribir con IA
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
      <Tooltip label="Interlineado">
        <MenuTrigger asChild>
          <button className="flex h-7 items-center rounded-md px-1 text-text hover:bg-surface-2" aria-label="Interlineado">
            <AlignVerticalSpaceAround className="size-4" />
            <ChevronDown className="size-3 text-muted" />
          </button>
        </MenuTrigger>
      </Tooltip>
      <MenuContent className="min-w-[150px]">
        <MenuLabel>Interlineado</MenuLabel>
        {values.map((v) => (
          <MenuCheckItem key={v} checked={current === v} onSelect={() => editor.chain().focus().setParagraphLineHeight(v).run()}>
            {v.replace(".", ",")}
          </MenuCheckItem>
        ))}
        <MenuSeparator />
        <MenuItem onSelect={() => editor.chain().focus().setParagraphLineHeight(null).run()}>Predeterminado</MenuItem>
      </MenuContent>
    </Menu>
  );
}

/* ------------------------------------------------------------------ */
/*  Insertar                                                           */
/* ------------------------------------------------------------------ */

const PAGE_NUMBER_POSITIONS: { label: string; zone: "header" | "footer"; slot: Slot }[] = [
  { label: "Abajo · centro", zone: "footer", slot: "center" },
  { label: "Abajo · derecha", zone: "footer", slot: "right" },
  { label: "Abajo · izquierda", zone: "footer", slot: "left" },
  { label: "Arriba · derecha", zone: "header", slot: "right" },
  { label: "Arriba · centro", zone: "header", slot: "center" },
  { label: "Arriba · izquierda", zone: "header", slot: "left" },
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
  const now = new Date();
  return (
    <>
      <Group label="Páginas">
        <Big icon={<SeparatorHorizontal />} label="Salto de página" onClick={() => c().setPageBreak().run()} title="Salto de página (Ctrl+Enter)" />
        <Big icon={<Minus />} label="Línea horizontal" onClick={() => c().setHorizontalRule().run()} />
      </Group>
      <Group label="Encabezado y pie">
        <Big icon={<PanelTop />} label="Encabezado" onClick={() => layout.edit("header")} title="Texto en la parte de arriba de cada página" />
        <Big icon={<PanelBottom />} label="Pie de página" onClick={() => layout.edit("footer")} title="Texto en la parte de abajo de cada página" />
        <Menu>
          <MenuTrigger asChild>
            <button className="flex h-full min-w-[54px] flex-col items-center justify-center gap-1 rounded-md px-1.5 text-[11.5px] hover:bg-surface-2">
              <Hash className="size-[22px]" />
              Número de página
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
            <MenuItem icon={<Settings2 />} onSelect={() => layout.edit("footer")}>Formato y primera página…</MenuItem>
            <MenuItem icon={<Trash2 />} danger disabled={!layout.hasPageNumbers} onSelect={layout.removePageNumbers}>
              Quitar números de página
            </MenuItem>
          </MenuContent>
        </Menu>
      </Group>
      <Group label="Tablas">
        <Popover>
          <PopoverTrigger asChild>
            <button className="flex h-full min-w-[54px] flex-col items-center justify-center gap-1 rounded-md px-1.5 text-[11.5px] hover:bg-surface-2">
              <Table2 className="size-[22px]" />
              Tabla
            </button>
          </PopoverTrigger>
          <PopoverContent>
            <TableGridPicker onPick={(rows, cols) => c().insertTable({ rows, cols, withHeaderRow: true }).run()} />
          </PopoverContent>
        </Popover>
      </Group>
      <Group label="Ilustraciones">
        <Big icon={<ImagePlus />} label="Imagen" onClick={() => fileRef.current?.click()} title="Insertar imagen desde el equipo" />
        <Popover>
          <PopoverTrigger asChild>
            <button className="flex h-full min-w-[54px] flex-col items-center justify-center gap-1 rounded-md px-1.5 text-[11.5px] hover:bg-surface-2">
              <FileImage className="size-[22px]" />
              Imagen web
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[320px]">
            <div className="mb-2 text-[12.5px] font-medium">Insertar imagen desde una URL</div>
            <div className="flex gap-2">
              <Input value={imgUrl} onChange={(e) => setImgUrl(e.target.value)} placeholder="https://…" />
              <PopoverClose asChild>
                <Button variant="primary" onClick={() => { if (imgUrl) c().setImage({ src: imgUrl }).run(); setImgUrl(""); }}>Insertar</Button>
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
      <Group label="Vínculos">
        <LinkButton editor={editor} big />
      </Group>
      <Group label="Texto">
        <Big icon={<SquareCode />} label="Bloque de código" onClick={() => c().toggleCodeBlock().run()} />
        <Big icon={<Quote />} label="Cita" onClick={() => c().toggleBlockquote().run()} />
        <Menu>
          <MenuTrigger asChild>
            <button className="flex h-full min-w-[54px] flex-col items-center justify-center gap-1 rounded-md px-1.5 text-[11.5px] hover:bg-surface-2">
              <CalendarDays className="size-[22px]" />
              Fecha y hora
            </button>
          </MenuTrigger>
          <MenuContent>
            {[
              now.toLocaleDateString("es-ES"),
              now.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" }),
              now.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
              now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }),
              now.toLocaleString("es-ES"),
            ].map((f) => (
              <MenuItem key={f} onSelect={() => c().insertContent(f).run()}>{f}</MenuItem>
            ))}
          </MenuContent>
        </Menu>
      </Group>
      <Group label="Símbolos">
        <CharGrid icon={<Omega className="size-[22px]" />} label="Símbolo" chars={SYMBOLS} onPick={(s) => c().insertContent(s).run()} />
        <CharGrid icon={<Smile className="size-[22px]" />} label="Emoji" chars={EMOJIS} onPick={(s) => c().insertContent(s).run()} />
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
            Vínculo
          </button>
        ) : (
          <button className={cn("grid h-7 w-7 place-items-center rounded-md hover:bg-surface-2", editor.isActive("link") && "bg-accent-soft text-accent")} aria-label="Vínculo">
            <Link2 className="size-4" />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-[340px]">
        <div className="mb-2 text-[12.5px] font-medium">Dirección del vínculo</div>
        <div className="flex gap-2">
          <Input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && apply()} placeholder="https://ejemplo.com" />
          <Button variant="primary" onClick={apply}>Aplicar</Button>
        </div>
        {editor.isActive("link") && (
          <button onClick={() => { editor.chain().focus().extendMarkRange("link").unsetLink().run(); setOpen(false); }} className="mt-2 text-[12px] text-red-500 hover:underline">
            Quitar vínculo
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
      <Group label="Configurar página">
        <Menu>
          <MenuTrigger asChild>
            <button className="flex h-full min-w-[54px] flex-col items-center justify-center gap-1 rounded-md px-1.5 text-[11.5px] hover:bg-surface-2">
              <Rows3 className="size-[22px]" />
              Márgenes
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
              Tamaño
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
          label={s.orientation === "portrait" ? "Vertical" : "Horizontal"}
          onClick={() => s.set("orientation", s.orientation === "portrait" ? "landscape" : "portrait")}
          title="Cambiar orientación"
        />
        <Big icon={<SeparatorHorizontal />} label="Salto" onClick={() => editor.chain().focus().setPageBreak().run()} title="Insertar salto de página" />
      </Group>
      <Group label="Texto predeterminado">
        <Col>
          <Row>
            <FontPicker value={s.fontFamily} onChange={(css) => s.set("fontFamily", css)} className="w-[160px]" />
            <FontSizePicker value={s.fontSize} onChange={(pt) => s.set("fontSize", pt)} />
          </Row>
          <Row>
            <span className="px-1 text-[11.5px] text-muted">Interlineado</span>
            <select value={s.lineHeight} onChange={(e) => s.set("lineHeight", Number(e.target.value))} className="h-7 rounded-md border border-border bg-surface px-1.5 text-[12.5px]">
              {[1, 1.15, 1.3, 1.5, 1.75, 2].map((v) => <option key={v} value={v}>{String(v).replace(".", ",")}</option>)}
            </select>
            <span className="px-1 text-[11.5px] text-muted">Espaciado</span>
            <select value={s.paraSpacing} onChange={(e) => s.set("paraSpacing", Number(e.target.value))} className="h-7 rounded-md border border-border bg-surface px-1.5 text-[12.5px]">
              {[0, 0.3, 0.6, 1, 1.5].map((v) => <option key={v} value={v}>{v === 0 ? "Ninguno" : `${String(v).replace(".", ",")} líneas`}</option>)}
            </select>
          </Row>
        </Col>
      </Group>
      <Group label="Fondo">
        <Big
          icon={<PanelTop />}
          label={s.paperMode === "white" ? "Hoja blanca" : "Color del tema"}
          onClick={() => s.set("paperMode", s.paperMode === "white" ? "theme" : "white")}
          title="Alternar entre hoja blanca y el color del tema"
        />
      </Group>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Revisar                                                            */
/* ------------------------------------------------------------------ */

function ReviewTab({ editor, onFind, onWordCount }: { editor: Editor; onFind: (replace?: boolean) => void; onWordCount: () => void }) {
  const { spellcheck, set, smartTyping } = useSettings();
  const run = useAI((s) => s.run);
  return (
    <>
      <Group label="Buscar">
        <Big icon={<Search />} label="Buscar" onClick={() => onFind(false)} title="Buscar (Ctrl+F)" />
        <Big icon={<Replace />} label="Reemplazar" onClick={() => onFind(true)} title="Reemplazar (Ctrl+H)" />
      </Group>
      <Group label="Revisión">
        <Big icon={<SpellCheck />} label="Ortografía" active={spellcheck} onClick={() => set("spellcheck", !spellcheck)} title="Subrayar errores ortográficos" />
        <Big icon={<CaseSensitive />} label="Autoformato" active={smartTyping} onClick={() => set("smartTyping", !smartTyping)} title="Comillas tipográficas, guiones y símbolos automáticos" />
        <Big icon={<WholeWord />} label="Contar palabras" onClick={onWordCount} />
      </Group>
      <Group label="Revisión con IA">
        <Big icon={<Wand2 />} label="Corregir" onClick={() => run(editor, "fix")} title="Corrige ortografía y gramática del texto seleccionado" />
        <Big icon={<ScanText />} label="Mejorar" onClick={() => run(editor, "improve")} title="Mejora la redacción del texto seleccionado" />
        <Menu>
          <MenuTrigger asChild>
            <button className="flex h-full min-w-[54px] flex-col items-center justify-center gap-1 rounded-md px-1.5 text-[11.5px] hover:bg-surface-2">
              <Languages className="size-[22px]" />
              Traducir
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
    { id: "page", label: "Diseño de impresión", icon: <FileText /> },
    { id: "web", label: "Diseño web", icon: <Monitor /> },
    { id: "focus", label: "Modo enfoque", icon: <Focus /> },
  ];
  const zoomTo = (z: number) => s.set("zoom", Math.max(50, Math.min(200, z)));
  return (
    <>
      <Group label="Vistas">
        {modes.map((m) => (
          <Big key={m.id} icon={m.icon} label={m.label} active={s.viewMode === m.id} onClick={() => s.set("viewMode", m.id)} />
        ))}
      </Group>
      <Group label="Zoom">
        <Big icon={<Minus />} label="Alejar" onClick={() => zoomTo(s.zoom - 10)} />
        <Big icon={<span className="text-[15px] font-semibold">100%</span>} label="Restablecer" onClick={() => zoomTo(100)} />
        <Big icon={<Plus />} label="Acercar" onClick={() => zoomTo(s.zoom + 10)} />
      </Group>
      <Group label="Ventana">
        <Big icon={<PanelRight />} label="Panel de IA" active={panelOpen} onClick={() => setPanelOpen(!panelOpen)} />
        <Big
          icon={<Maximize />}
          label="Pantalla completa"
          onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen())}
          title="Pantalla completa (F11)"
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
      <Group label="Asistente">
        <Big
          icon={<span className="grid size-[26px] place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white"><Sparkles className="size-4" /></span>}
          label="Chat con IA"
          active={panelOpen}
          onClick={() => setPanelOpen(!panelOpen)}
        />
        <Menu>
          <MenuTrigger asChild>
            <button className="flex h-full min-w-[54px] flex-col items-center justify-center gap-1 rounded-md px-1.5 text-[11.5px] hover:bg-surface-2">
              <Wand2 className="size-[22px]" />
              Todas las acciones
            </button>
          </MenuTrigger>
          <AIActionsMenuContent editor={editor} />
        </Menu>
      </Group>
      <Group label="Editar selección">
        <Big icon={<Wand2 />} label="Mejorar" onClick={() => run(editor, "improve")} />
        <Big icon={<SpellCheck />} label="Corregir" onClick={() => run(editor, "fix")} />
        <Big icon={<Scissors />} label="Acortar" onClick={() => run(editor, "shorter")} />
        <Big icon={<Plus />} label="Ampliar" onClick={() => run(editor, "longer")} />
      </Group>
      <Group label="Generar">
        <Big icon={<Heading1 />} label="Resumir" onClick={() => run(editor, "summarize")} />
        <Big icon={<ListChecks />} label="En lista" onClick={() => run(editor, "bullets")} />
        <Big icon={<Table2 />} label="En tabla" onClick={() => run(editor, "table")} />
        <Big icon={<Sparkles />} label="Continuar" onClick={() => run(editor, "continue")} />
      </Group>
      <div className="flex items-center px-3 text-[12px] leading-snug text-muted">
        Selecciona texto y elige una acción.
        <br />
        Verás el resultado antes de aplicarlo.
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
      <Group label="Filas">
        <Big icon={<ArrowUpToLine />} label="Insertar arriba" onClick={() => c().addRowBefore().run()} />
        <Big icon={<ArrowDownToLine />} label="Insertar debajo" onClick={() => c().addRowAfter().run()} />
        <Big icon={<Trash2 />} label="Eliminar fila" onClick={() => c().deleteRow().run()} />
      </Group>
      <Group label="Columnas">
        <Big icon={<ArrowLeftToLine />} label="Insertar a la izq." onClick={() => c().addColumnBefore().run()} />
        <Big icon={<ArrowRightToLine />} label="Insertar a la der." onClick={() => c().addColumnAfter().run()} />
        <Big icon={<Trash2 />} label="Eliminar columna" onClick={() => c().deleteColumn().run()} />
      </Group>
      <Group label="Celdas">
        <Big icon={<Merge />} label="Combinar" onClick={() => c().mergeCells().run()} />
        <Big icon={<Split />} label="Dividir" onClick={() => c().splitCell().run()} />
        <Big icon={<Columns3 />} label="Fila de encabezado" onClick={() => c().toggleHeaderRow().run()} />
      </Group>
      <Group label="Tabla">
        <Big icon={<Trash2 className="text-red-500" />} label="Eliminar tabla" onClick={() => c().deleteTable().run()} />
      </Group>
    </>
  );
}
