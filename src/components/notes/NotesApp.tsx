import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { EditorContent, type Editor } from "@tiptap/react";
import {
  ArrowLeft, Bold, CheckSquare, Code, FileText, Hash, Highlighter, ImagePlus, Italic, List, ListOrdered, MoreHorizontal,
  Palette, Pin, PinOff, Plus, Quote, Redo2, Search, Sparkles, Star, StickyNote, Strikethrough, Table2, Trash2, Underline,
  Undo2, X, Copy, FileDown,
} from "lucide-react";
import { createDoc, db, displayTitle, duplicateDoc, trashDoc, updateDoc, type DocRecord } from "@/lib/db";
import { debounce, relativeTime } from "@/lib/format";
import { exportDocx, exportMarkdown } from "@/lib/io";
import { useApp } from "@/store/app";
import { useSettings } from "@/store/settings";
import { useDocEditor } from "@/components/editor/useDocEditor";
import { useEditorFlags } from "@/components/editor/controls";
import { LinkButton, readImageFile } from "@/components/editor/Ribbon";
import { SelectionBubble } from "@/components/editor/SelectionBubble";
import { SaveIndicator } from "@/components/editor/StatusBar";
import { AIActionsMenuContent } from "@/components/ai/AIActionsMenu";
import { AIResultCard } from "@/components/ai/AIResultCard";
import { ChatPanel } from "@/components/ai/ChatPanel";
import { useAI } from "@/components/ai/aiStore";
import {
  Button, IconButton, Input, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, Popover, PopoverClose, PopoverContent,
  PopoverTrigger, Tooltip, cn,
} from "@/components/ui";

export const NOTE_COLORS: { id: string | null; name: string; swatch: string }[] = [
  { id: null, name: "Sin color", swatch: "transparent" },
  { id: "yellow", name: "Amarillo", swatch: "#f6c445" },
  { id: "green", name: "Verde", swatch: "#4cc38a" },
  { id: "blue", name: "Azul", swatch: "#4f9dff" },
  { id: "purple", name: "Morado", swatch: "#9b7bff" },
  { id: "pink", name: "Rosa", swatch: "#f06595" },
  { id: "orange", name: "Naranja", swatch: "#ff922b" },
];
const swatch = (id: string | null) => NOTE_COLORS.find((c) => c.id === id)?.swatch ?? "transparent";

type Filter = { kind: "all" } | { kind: "pinned" } | { kind: "favorite" } | { kind: "tag"; tag: string };

export default function NotesApp() {
  const route = useApp((s) => s.route);
  const navigate = useApp((s) => s.navigate);
  const selectedId = route.name === "notes" ? route.id : undefined;
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>({ kind: "all" });
  const width = useSettings((s) => s.notesSidebarWidth);

  const notes = useLiveQuery(
    () => db.docs.where("kind").equals("note").filter((d) => d.deletedAt === null).toArray(),
    [],
  );

  const tags = useMemo(() => [...new Set((notes ?? []).flatMap((n) => n.tags))].sort((a, b) => a.localeCompare(b)), [notes]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (notes ?? [])
      .filter((n) => {
        if (filter.kind === "pinned" && !n.pinned) return false;
        if (filter.kind === "favorite" && !n.favorite) return false;
        if (filter.kind === "tag" && !n.tags.includes(filter.tag)) return false;
        return !needle || (n.title + " " + n.text + " " + n.tags.join(" ")).toLowerCase().includes(needle);
      })
      .sort((a, b) => b.pinned - a.pinned || b.updatedAt - a.updatedAt);
  }, [notes, q, filter]);

  // Selecciona la primera nota si no hay ninguna seleccionada
  useEffect(() => {
    if (!selectedId && notes && visible.length) navigate({ name: "notes", id: visible[0].id });
  }, [selectedId, notes, visible, navigate]);

  const selected = notes?.find((n) => n.id === selectedId) ?? null;

  const create = async () => {
    const doc = await createDoc("note", { tags: filter.kind === "tag" ? [filter.tag] : [] });
    setQ("");
    navigate({ name: "notes", id: doc.id });
  };

  return (
    <div className="flex h-full bg-bg">
      <aside className="flex shrink-0 flex-col border-r border-border bg-surface" style={{ width }}>
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-2">
          <IconButton label="Volver al inicio" onClick={() => navigate({ name: "home" })}>
            <ArrowLeft className="size-4" />
          </IconButton>
          <span className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 text-white">
            <StickyNote className="size-4" />
          </span>
          <span className="text-[14px] font-semibold">Notas</span>
          <Button size="sm" variant="primary" className="ml-auto" icon={<Plus className="size-3.5" />} onClick={create}>
            Nueva
          </Button>
        </div>
        <div className="space-y-2 border-b border-border p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar notas…" className="h-8 pl-8 text-[13px]" />
          </div>
          <div className="flex flex-wrap gap-1">
            <Chip active={filter.kind === "all"} onClick={() => setFilter({ kind: "all" })}>Todas</Chip>
            <Chip active={filter.kind === "pinned"} onClick={() => setFilter({ kind: "pinned" })}>Fijadas</Chip>
            <Chip active={filter.kind === "favorite"} onClick={() => setFilter({ kind: "favorite" })}>Favoritas</Chip>
            {tags.map((t) => (
              <Chip key={t} active={filter.kind === "tag" && filter.tag === t} onClick={() => setFilter({ kind: "tag", tag: t })}>
                #{t}
              </Chip>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {notes && visible.length === 0 && (
            <div className="px-4 py-10 text-center text-[13px] text-muted">
              {q || filter.kind !== "all" ? "No hay notas que coincidan." : "Aún no tienes notas."}
              <div className="mt-3">
                <Button size="sm" variant="outline" icon={<Plus className="size-3.5" />} onClick={create}>Crear nota</Button>
              </div>
            </div>
          )}
          {visible.map((n) => (
            <button
              key={n.id}
              onClick={() => navigate({ name: "notes", id: n.id })}
              className={cn(
                "group relative mb-1 block w-full overflow-hidden rounded-[var(--radius)] border px-3 py-2.5 text-left transition-colors",
                n.id === selectedId ? "border-accent/50 bg-accent-soft" : "border-transparent hover:bg-surface-2",
              )}
            >
              {n.color && <span className="absolute inset-y-0 left-0 w-1" style={{ background: swatch(n.color) }} />}
              <div className="flex items-center gap-1.5">
                {n.pinned === 1 && <Pin className="size-3 shrink-0 text-accent" />}
                <span className="truncate text-[13.5px] font-semibold">{displayTitle(n)}</span>
                {n.favorite === 1 && <Star className="size-3 shrink-0 fill-amber-400 text-amber-400" />}
              </div>
              <div className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-muted">{n.text.replace(/\n+/g, " ").slice(0, 160) || "Sin contenido"}</div>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-muted">
                <span>{relativeTime(n.updatedAt)}</span>
                {n.tags.slice(0, 3).map((t) => <span key={t} className="text-accent">#{t}</span>)}
              </div>
            </button>
          ))}
        </div>
        <div className="border-t border-border px-3 py-2 text-[11.5px] text-muted">
          {notes?.length ?? 0} notas
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        {selected ? (
          <NoteEditor key={selected.id} note={selected} />
        ) : (
          <div className="grid h-full place-items-center text-center text-muted">
            <div>
              <StickyNote className="mx-auto mb-3 size-10 opacity-30" />
              <p className="mb-3">Selecciona una nota o crea una nueva</p>
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={create}>Nueva nota</Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "h-6 rounded-full px-2.5 text-[11.5px] font-medium transition-colors",
        active ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted hover:text-text",
      )}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Editor de nota                                                     */
/* ------------------------------------------------------------------ */

function NoteEditor({ note }: { note: DocRecord }) {
  const [initial] = useState(note.content);
  const { editor, saveState } = useDocEditor(note.id, initial, "Escribe tu nota…");
  if (!editor) return null;
  return <NoteShell note={note} editor={editor} saveState={saveState} />;
}

function NoteShell({ note, editor, saveState }: { note: DocRecord; editor: Editor; saveState: ReturnType<typeof useDocEditor>["saveState"] }) {
  const s = useSettings();
  const toast = useApp((st) => st.toast);
  const navigate = useApp((st) => st.navigate);
  const { panelOpen, setPanelOpen, discard } = useAI();
  const [title, setTitle] = useState(note.title);
  const [tagDraft, setTagDraft] = useState("");
  const saveTitle = useMemo(() => debounce((t: string) => updateDoc(note.id, { title: t }), 400), [note.id]);
  useEffect(() => () => saveTitle.cancel(), [saveTitle]);
  useEffect(() => () => discard(), [discard]);

  const addTag = () => {
    const t = tagDraft.trim().replace(/^#/, "").toLowerCase();
    if (t && !note.tags.includes(t)) updateDoc(note.id, { tags: [...note.tags, t] });
    setTagDraft("");
  };

  const remove = async () => {
    await trashDoc(note.id);
    toast("Nota movida a la papelera");
    navigate({ name: "notes" });
  };

  const tint = note.color ? `color-mix(in oklab, ${swatch(note.color)} 7%, var(--paper))` : "var(--paper)";

  return (
    <div className="flex h-full">
      <div className="relative flex min-w-0 flex-1 flex-col" style={{ background: tint }}>
        <div className="no-print flex h-11 shrink-0 items-center border-b border-border bg-surface/80 backdrop-blur">
          <NoteToolbar editor={editor} />
          <NoteActions note={note} editor={editor} title={title} onRemove={remove} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div
            className="mx-auto max-w-[780px] px-10 pt-8 pb-32"
            style={{ fontFamily: s.fontFamily, fontSize: `${s.fontSize}pt`, lineHeight: s.lineHeight, ["--para-spacing" as string]: `${s.paraSpacing}em` }}
          >
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                saveTitle(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  // Foco inmediato (commands.focus espera un fotograma y se perderían teclas)
                  editor.view.focus();
                  editor.commands.setTextSelection(1);
                }
              }}
              placeholder="Título"
              className="mb-2 w-full bg-transparent text-[2em] font-bold tracking-tight text-paper-text outline-none placeholder:text-paper-text/30"
              style={{ fontFamily: "inherit" }}
            />
            <div className="no-print mb-5 flex flex-wrap items-center gap-1.5 text-[12px] text-muted" style={{ fontFamily: "var(--ui-font)" }}>
              <span>Editado {relativeTime(note.updatedAt)}</span>
              <span>·</span>
              <SaveIndicator state={saveState} />
              <span>·</span>
              {note.tags.map((t) => (
                <span key={t} className="group flex items-center gap-0.5 rounded-full bg-accent-soft px-2 py-0.5 text-accent">
                  #{t}
                  <button onClick={() => updateDoc(note.id, { tags: note.tags.filter((x) => x !== t) })} className="opacity-50 hover:opacity-100" aria-label={`Quitar etiqueta ${t}`}>
                    <X className="size-3" />
                  </button>
                </span>
              ))}
              <span className="flex items-center gap-0.5">
                <Hash className="size-3" />
                <input
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  onBlur={addTag}
                  placeholder="Añadir etiqueta"
                  className="w-24 bg-transparent outline-none placeholder:text-muted/70"
                />
              </span>
            </div>
            <EditorContent editor={editor} />
          </div>
        </div>
        <AIResultCard editor={editor} />

      </div>
      {panelOpen && (
        <aside className="no-print w-[340px] shrink-0">
          <ChatPanel editor={editor} docTitle={title} onClose={() => setPanelOpen(false)} />
        </aside>
      )}
      <SelectionBubble editor={editor} />
    </div>
  );
}

function NoteActions({ note, editor, title, onRemove }: { note: DocRecord; editor: Editor; title: string; onRemove: () => void }) {
  const navigate = useApp((st) => st.navigate);
  const { panelOpen, setPanelOpen } = useAI();
  return (
    <div className="flex shrink-0 items-center gap-0.5 px-2">
      <Popover>
        <Tooltip label="Color de la nota">
          <PopoverTrigger asChild>
            <button className="grid size-8 place-items-center rounded-md hover:bg-surface-2" aria-label="Color de la nota">
              <Palette className="size-4" />
            </button>
          </PopoverTrigger>
        </Tooltip>
        <PopoverContent align="end" className="flex gap-1.5 p-2">
          {NOTE_COLORS.map((c) => (
            <PopoverClose asChild key={c.name}>
              <button
                onClick={() => updateDoc(note.id, { color: c.id })}
                title={c.name}
                className={cn("size-7 rounded-full border border-border", note.color === c.id && "ring-2 ring-accent ring-offset-1 ring-offset-surface")}
                style={{ background: c.id ? c.swatch : "var(--surface)" }}
              />
            </PopoverClose>
          ))}
        </PopoverContent>
      </Popover>
      <IconButton label={note.pinned ? "Desfijar" : "Fijar"} active={note.pinned === 1} onClick={() => updateDoc(note.id, { pinned: note.pinned ? 0 : 1 })}>
        {note.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
      </IconButton>
      <IconButton label={note.favorite ? "Quitar de favoritas" : "Favorita"} onClick={() => updateDoc(note.id, { favorite: note.favorite ? 0 : 1 })}>
        <Star className={cn("size-4", note.favorite === 1 && "fill-amber-400 text-amber-400")} />
      </IconButton>
      <Button size="sm" variant={panelOpen ? "secondary" : "primary"} className="ml-1" icon={<Sparkles className="size-3.5" />} onClick={() => setPanelOpen(!panelOpen)}>
        IA
      </Button>
      <Menu>
        <MenuTrigger asChild>
          <button className="grid size-8 place-items-center rounded-md hover:bg-surface-2" aria-label="Más opciones">
            <MoreHorizontal className="size-4" />
          </button>
        </MenuTrigger>
        <MenuContent align="end">
          <MenuItem
            icon={<FileText />}
            onSelect={async () => {
              await updateDoc(note.id, { kind: "document" });
              navigate({ name: "document", id: note.id });
            }}
          >
            Abrir como documento
          </MenuItem>
          <MenuItem icon={<Copy />} onSelect={async () => { const d = await duplicateDoc(note.id); if (d) navigate({ name: "notes", id: d.id }); }}>Duplicar</MenuItem>
          <MenuItem icon={<FileDown />} onSelect={() => exportMarkdown(editor.getHTML(), title)}>Exportar a Markdown</MenuItem>
          <MenuItem icon={<FileDown />} onSelect={() => exportDocx(editor.getJSON(), title)}>Exportar a Word</MenuItem>
          <MenuSeparator />
          <MenuItem icon={<Trash2 />} danger onSelect={onRemove}>Mover a la papelera</MenuItem>
        </MenuContent>
      </Menu>
    </div>
  );
}

function NoteToolbar({ editor }: { editor: Editor }) {
  const f = useEditorFlags(editor);
  const fileRef = useRef<HTMLInputElement>(null);
  const c = () => editor.chain().focus();
  const block = f.heading ? `h${f.heading}` : "p";
  return (
    <div
      className="flex h-full min-w-0 flex-1 items-center gap-0.5 overflow-x-auto overflow-y-hidden px-3 [scrollbar-width:none]"
      onWheel={(e) => {
        // Rueda vertical → desplazamiento horizontal cuando la barra no cabe
        if (e.deltaY) e.currentTarget.scrollLeft += e.deltaY;
      }}
    >
      <IconButton size="sm" label="Deshacer" shortcut="Ctrl+Z" disabled={!f.canUndo} onClick={() => c().undo().run()}><Undo2 className="size-4" /></IconButton>
      <IconButton size="sm" label="Rehacer" shortcut="Ctrl+Y" disabled={!f.canRedo} onClick={() => c().redo().run()}><Redo2 className="size-4" /></IconButton>
      <span className="mx-1 h-5 w-px bg-border" />
      <select
        value={block}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "p") c().setParagraph().run();
          else c().setHeading({ level: Number(v.slice(1)) as 1 | 2 | 3 }).run();
        }}
        className="h-7 rounded-md border border-border bg-surface px-1.5 text-[12.5px]"
        aria-label="Estilo de párrafo"
      >
        <option value="p">Texto</option>
        <option value="h1">Título 1</option>
        <option value="h2">Título 2</option>
        <option value="h3">Título 3</option>
      </select>
      <span className="mx-1 h-5 w-px bg-border" />
      <IconButton size="sm" label="Negrita" shortcut="Ctrl+B" active={f.bold} onClick={() => c().toggleBold().run()}><Bold className="size-4" /></IconButton>
      <IconButton size="sm" label="Cursiva" shortcut="Ctrl+I" active={f.italic} onClick={() => c().toggleItalic().run()}><Italic className="size-4" /></IconButton>
      <IconButton size="sm" label="Subrayado" shortcut="Ctrl+U" active={f.underline} onClick={() => c().toggleUnderline().run()}><Underline className="size-4" /></IconButton>
      <IconButton size="sm" label="Tachado" active={f.strike} onClick={() => c().toggleStrike().run()}><Strikethrough className="size-4" /></IconButton>
      <IconButton size="sm" label="Resaltar" active={f.highlight} onClick={() => c().toggleHighlight({ color: "#fff59d" }).run()}><Highlighter className="size-4" /></IconButton>
      <span className="mx-1 h-5 w-px bg-border" />
      <IconButton size="sm" label="Lista" active={f.bulletList} onClick={() => c().toggleBulletList().run()}><List className="size-4" /></IconButton>
      <IconButton size="sm" label="Lista numerada" active={f.orderedList} onClick={() => c().toggleOrderedList().run()}><ListOrdered className="size-4" /></IconButton>
      <IconButton size="sm" label="Tareas" active={f.taskList} onClick={() => c().toggleTaskList().run()}><CheckSquare className="size-4" /></IconButton>
      <IconButton size="sm" label="Cita" active={f.blockquote} onClick={() => c().toggleBlockquote().run()}><Quote className="size-4" /></IconButton>
      <IconButton size="sm" label="Código" active={f.codeBlock} onClick={() => c().toggleCodeBlock().run()}><Code className="size-4" /></IconButton>
      <span className="mx-1 h-5 w-px bg-border" />
      <LinkButton editor={editor} />
      <IconButton size="sm" label="Imagen" onClick={() => fileRef.current?.click()}><ImagePlus className="size-4" /></IconButton>
      <IconButton size="sm" label="Tabla" onClick={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><Table2 className="size-4" /></IconButton>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) c().setImage({ src: await readImageFile(file), alt: file.name }).run();
        }}
      />
      <span className="mx-1 h-5 w-px bg-border" />
      <Menu>
        <MenuTrigger asChild>
          <button className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[12.5px] font-medium text-accent hover:bg-accent-soft">
            <Sparkles className="size-3.5" />
            Escribir con IA
          </button>
        </MenuTrigger>
        <AIActionsMenuContent editor={editor} />
      </Menu>
    </div>
  );
}
