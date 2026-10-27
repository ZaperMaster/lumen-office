import { useMemo, useRef, useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Clock, Copy, FilePlus2, FileText, FolderOpen, Home, MoreHorizontal, Moon, Pin, PinOff, Presentation,
  RotateCcw, Search, Settings, Sheet, Sparkles, Star, StickyNote, Sun, Trash2, Upload,
} from "lucide-react";
import { db, deleteForever, displayTitle, duplicateDoc, restoreDoc, trashDoc, updateDoc, type DocRecord } from "@/lib/db";
import { TEMPLATES, type Template } from "@/lib/templates";
import { createFromTemplate, newDocument, newNote, openDoc } from "@/lib/actions";
// El módulo de importación (editor + docx) se carga solo al importar
const ACCEPTED_IMPORTS = ".docx,.lumen,.md,.markdown,.html,.htm,.txt";
import { greeting, relativeTime } from "@/lib/format";
import { useApp, type Route } from "@/store/app";
import { useSettings } from "@/store/settings";
import { getTheme } from "@/lib/themes";
import { Button, Input, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, Segmented, Tooltip, cn } from "@/components/ui";
import { Logo } from "@/components/Logo";

type Section = NonNullable<Extract<Route, { name: "home" }>["section"]>;

export function Launcher() {
  const route = useApp((s) => s.route) as Extract<Route, { name: "home" }>;
  const section: Section = route.section ?? "home";
  const navigate = useApp((s) => s.navigate);

  return (
    <div className="flex h-full bg-bg">
      <Rail section={section} onChange={(s) => navigate({ name: "home", section: s })} />
      <main className="relative min-w-0 flex-1 overflow-y-auto">
        {/* Franja superior para mover la ventana (la app no usa la barra de título de Windows) */}
        <div data-tauri-drag-region className="no-print sticky top-0 z-10 -mb-9 h-9" />
        <div key={section} className="mx-auto max-w-[1180px] animate-fade-in px-10 py-9">
          {section === "home" && <HomeSection />}
          {section === "new" && <NewSection />}
          {section === "open" && <OpenSection />}
          {section === "trash" && <TrashSection />}
        </div>
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Barra lateral                                                      */
/* ------------------------------------------------------------------ */

function Rail({ section, onChange }: { section: Section; onChange: (s: Section) => void }) {
  const openSettings = useApp((s) => s.openSettings);
  const { themeId, set } = useSettings();
  const dark = getTheme(themeId).dark;
  const items: { id: Section; label: string; icon: ReactNode }[] = [
    { id: "home", label: "Inicio", icon: <Home className="size-[18px]" /> },
    { id: "new", label: "Nuevo", icon: <FilePlus2 className="size-[18px]" /> },
    { id: "open", label: "Abrir", icon: <FolderOpen className="size-[18px]" /> },
    { id: "trash", label: "Papelera", icon: <Trash2 className="size-[18px]" /> },
  ];
  return (
    <aside className="flex w-[220px] shrink-0 flex-col border-r border-border bg-surface px-3 py-5">
      <div data-tauri-drag-region className="mb-7 flex items-center gap-2.5 px-2">
        <Logo className="size-8" />
        <div>
          <div className="text-[15px] font-bold leading-tight">Lumen</div>
          <div className="text-[11px] text-muted">Office</div>
        </div>
      </div>
      <nav className="flex flex-col gap-0.5">
        {items.map((it) => (
          <button
            key={it.id}
            onClick={() => onChange(it.id)}
            className={cn(
              "flex h-9 items-center gap-3 rounded-[var(--radius)] px-3 text-[13.5px] font-medium transition-colors",
              section === it.id ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2 hover:text-text",
            )}
          >
            {it.icon}
            {it.label}
          </button>
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-0.5">
        <button
          onClick={() => set("themeId", dark ? "light" : "dark")}
          className="flex h-9 items-center gap-3 rounded-[var(--radius)] px-3 text-[13.5px] font-medium text-muted hover:bg-surface-2 hover:text-text"
        >
          {dark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
          {dark ? "Modo claro" : "Modo oscuro"}
        </button>
        <button
          onClick={() => openSettings()}
          className="flex h-9 items-center gap-3 rounded-[var(--radius)] px-3 text-[13.5px] font-medium text-muted hover:bg-surface-2 hover:text-text"
        >
          <Settings className="size-[18px]" />
          Configuración
        </button>
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/*  Inicio                                                             */
/* ------------------------------------------------------------------ */

interface Tool {
  id: string;
  name: string;
  description: string;
  icon: ReactNode;
  gradient: string;
  action?: () => void;
  soon?: boolean;
}

function HomeSection() {
  const navigate = useApp((s) => s.navigate);
  const userName = useSettings((s) => s.userName);

  const tools: Tool[] = [
    {
      id: "document",
      name: "Documento",
      description: "Procesador de textos con páginas, estilos, tablas e IA.",
      icon: <FileText className="size-6" />,
      gradient: "linear-gradient(135deg,#3b82f6,#6366f1)",
      action: () => newDocument(),
    },
    {
      id: "notes",
      name: "Notas",
      description: "Bloc de notas rápido con búsqueda, colores y fijadas.",
      icon: <StickyNote className="size-6" />,
      gradient: "linear-gradient(135deg,#f59e0b,#f97316)",
      action: () => navigate({ name: "notes" }),
    },
    {
      id: "assistant",
      name: "Asistente IA",
      description: "Escribe, resume y traduce con IA local, sin conexión.",
      icon: <Sparkles className="size-6" />,
      gradient: "linear-gradient(135deg,#8b5cf6,#d946ef)",
      action: () => navigate({ name: "assistant" }),
    },
    {
      id: "sheets",
      name: "Hojas de cálculo",
      description: "Tablas, fórmulas y gráficos.",
      icon: <Sheet className="size-6" />,
      gradient: "linear-gradient(135deg,#10b981,#059669)",
      soon: true,
    },
    {
      id: "slides",
      name: "Presentaciones",
      description: "Diapositivas con temas.",
      icon: <Presentation className="size-6" />,
      gradient: "linear-gradient(135deg,#ef4444,#f97316)",
      soon: true,
    },
  ];

  return (
    <>
      <header className="mb-8 flex items-end justify-between gap-6">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight">
            {greeting()}
            {userName ? `, ${userName}` : ""}
          </h1>
          <p className="mt-1 text-muted">¿Qué herramienta quieres usar hoy?</p>
        </div>
        <QuickSearch />
      </header>

      <section className="mb-10 grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
        {tools.map((tool) => (
          <ToolCard key={tool.id} tool={tool} />
        ))}
      </section>

      <SectionTitle
        action={
          <Button variant="ghost" size="sm" onClick={() => navigate({ name: "home", section: "new" })}>
            Más plantillas
          </Button>
        }
      >
        Empieza con una plantilla
      </SectionTitle>
      <div className="mb-10 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4">
        {TEMPLATES.slice(0, 6).map((t) => (
          <TemplateCard key={t.id} tpl={t} />
        ))}
      </div>

      <RecentList limit={12} />
    </>
  );
}

function ToolCard({ tool }: { tool: Tool }) {
  return (
    <button
      onClick={tool.action}
      disabled={tool.soon}
      className={cn(
        "group relative flex flex-col items-start gap-3 rounded-[calc(var(--radius)+6px)] border border-border bg-surface p-5 text-left",
        "transition-all duration-200",
        tool.soon ? "opacity-60" : "hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-soft",
      )}
    >
      <div
        className="grid size-12 place-items-center rounded-[14px] text-white shadow-md transition-transform group-hover:scale-105"
        style={{ background: tool.gradient }}
      >
        {tool.icon}
      </div>
      <div>
        <div className="flex items-center gap-2 text-[15px] font-semibold">
          {tool.name}
          {tool.soon && (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10.5px] font-medium text-muted">Próximamente</span>
          )}
        </div>
        <p className="mt-1 text-[12.5px] leading-snug text-muted">{tool.description}</p>
      </div>
    </button>
  );
}

function TemplateCard({ tpl }: { tpl: Template }) {
  return (
    <button onClick={() => createFromTemplate(tpl.id)} className="group text-left">
      <div
        className="relative mb-2 aspect-[3/4] overflow-hidden rounded-[var(--radius)] border border-border p-3 shadow-sm transition-all group-hover:-translate-y-0.5 group-hover:border-accent group-hover:shadow-soft"
        style={{ background: tpl.tint }}
      >
        <TemplatePreview tpl={tpl} />
        {tpl.kind === "note" && (
          <span className="absolute top-2 right-2 rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">Nota</span>
        )}
      </div>
      <div className="truncate text-[13px] font-medium">{tpl.name}</div>
      <div className="truncate text-[11.5px] text-muted">{tpl.description}</div>
    </button>
  );
}

/** Dibuja una miniatura esquemática del documento. */
function TemplatePreview({ tpl }: { tpl: Template }) {
  const lines = useMemo(() => {
    const { content } = tpl.build();
    return (content.content ?? []).slice(0, 14);
  }, [tpl]);
  if (tpl.id === "blank") {
    return <div className="grid h-full place-items-center text-[#c4c7cf]"><FilePlus2 className="size-8" /></div>;
  }
  return (
    <div className="flex flex-col gap-[5px]">
      {lines.map((n, i) => {
        const align = n.attrs?.textAlign;
        const justify = align === "center" ? "justify-center" : align === "right" ? "justify-end" : "justify-start";
        if (n.type === "heading") {
          const w = n.attrs?.level === 1 ? "70%" : "45%";
          return (
            <div key={i} className={cn("flex", justify)}>
              <div className="rounded-sm bg-[#3a3d46]" style={{ width: w, height: n.attrs?.level === 1 ? 7 : 5 }} />
            </div>
          );
        }
        if (n.type === "horizontalRule") return <div key={i} className="h-px bg-[#c9ccd4]" />;
        if (n.type === "table") return <div key={i} className="h-8 rounded-sm border border-[#c9ccd4] bg-white/50" />;
        if (n.type === "pageBreak") return null;
        const w = `${55 + ((i * 37) % 40)}%`;
        return (
          <div key={i} className={cn("flex", justify)}>
            <div className="h-[3px] rounded-sm bg-[#a9adb8]" style={{ width: w }} />
          </div>
        );
      })}
    </div>
  );
}

function QuickSearch() {
  const [q, setQ] = useState("");
  const results = useLiveQuery(async () => {
    if (!q.trim()) return [];
    const needle = q.toLowerCase();
    return (await db.docs.filter((d) => d.deletedAt === null && (d.title + " " + d.text).toLowerCase().includes(needle)).limit(8).toArray());
  }, [q]);
  return (
    <div className="relative w-[340px]">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en documentos y notas…" className="h-10 pl-9" />
      {q && results && (
        <div className="absolute top-12 right-0 left-0 z-20 animate-pop-in rounded-[var(--radius)] border border-border bg-surface p-1 shadow-soft">
          {results.length === 0 && <div className="px-3 py-2 text-[13px] text-muted">Sin resultados</div>}
          {results.map((d) => (
            <button key={d.id} onClick={() => openDoc(d)} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-surface-2">
              <DocIcon doc={d} />
              <span className="flex-1 truncate text-[13px]">{displayTitle(d)}</span>
              <span className="text-[11.5px] text-muted">{relativeTime(d.updatedAt)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Lista de recientes                                                 */
/* ------------------------------------------------------------------ */

type Filter = "all" | "document" | "note" | "favorite";

function RecentList({ limit, title = "Recientes" }: { limit?: number; title?: string }) {
  const [filter, setFilter] = useState<Filter>("all");
  const docs = useLiveQuery(async () => {
    const all = await db.docs.orderBy("openedAt").reverse().filter((d) => d.deletedAt === null).toArray();
    const f = all.filter((d) => (filter === "all" ? true : filter === "favorite" ? d.favorite === 1 : d.kind === filter));
    f.sort((a, b) => b.pinned - a.pinned);
    return limit ? f.slice(0, limit) : f;
  }, [filter, limit]);

  return (
    <section>
      <SectionTitle
        action={
          <Segmented<Filter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "Todos" },
              { value: "document", label: "Documentos" },
              { value: "note", label: "Notas" },
              { value: "favorite", label: "Favoritos" },
            ]}
          />
        }
      >
        {title}
      </SectionTitle>
      <div className="overflow-hidden rounded-[calc(var(--radius)+4px)] border border-border bg-surface">
        <div className="grid grid-cols-[1fr_140px_160px_44px] items-center border-b border-border px-4 py-2 text-[11.5px] font-medium tracking-wide text-muted uppercase">
          <span>Nombre</span>
          <span>Tipo</span>
          <span>Modificado</span>
          <span />
        </div>
        {docs?.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-4 py-12 text-center text-muted">
            <Clock className="size-8 opacity-40" />
            <p className="text-[13.5px]">Aún no hay nada aquí.</p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="primary" onClick={() => newDocument()}>Nuevo documento</Button>
              <Button size="sm" onClick={() => newNote()}>Nueva nota</Button>
            </div>
          </div>
        )}
        {docs?.map((d) => <DocRow key={d.id} doc={d} />)}
      </div>
    </section>
  );
}

function DocIcon({ doc }: { doc: DocRecord }) {
  return doc.kind === "note" ? (
    <span className="grid size-7 place-items-center rounded-md bg-amber-500/15 text-amber-600"><StickyNote className="size-4" /></span>
  ) : (
    <span className="grid size-7 place-items-center rounded-md bg-blue-500/15 text-blue-600"><FileText className="size-4" /></span>
  );
}

function DocRow({ doc }: { doc: DocRecord }) {
  const toast = useApp((s) => s.toast);
  return (
    <div
      onDoubleClick={() => openDoc(doc)}
      className="group grid grid-cols-[1fr_140px_160px_44px] items-center border-b border-border px-4 py-2 last:border-0 hover:bg-surface-2"
    >
      <button onClick={() => openDoc(doc)} className="flex min-w-0 items-center gap-3 text-left">
        <DocIcon doc={doc} />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 truncate text-[13.5px] font-medium">
            {doc.pinned === 1 && <Pin className="size-3 text-accent" />}
            {doc.favorite === 1 && <Star className="size-3 fill-amber-400 text-amber-400" />}
            <span className="truncate">{displayTitle(doc)}</span>
          </div>
          <div className="truncate text-[12px] text-muted">{doc.text.slice(0, 90) || "Vacío"}</div>
        </div>
      </button>
      <span className="text-[12.5px] text-muted">{doc.kind === "note" ? "Nota" : "Documento"}</span>
      <span className="text-[12.5px] text-muted">{relativeTime(doc.updatedAt)}</span>
      <Menu>
        <MenuTrigger asChild>
          <button className="grid size-8 place-items-center rounded-md text-muted opacity-0 group-hover:opacity-100 hover:bg-surface-3 data-[state=open]:opacity-100" aria-label="Más acciones">
            <MoreHorizontal className="size-4" />
          </button>
        </MenuTrigger>
        <MenuContent align="end">
          <MenuItem icon={<FolderOpen />} onSelect={() => openDoc(doc)}>Abrir</MenuItem>
          <MenuItem icon={doc.pinned ? <PinOff /> : <Pin />} onSelect={() => updateDoc(doc.id, { pinned: doc.pinned ? 0 : 1 })}>
            {doc.pinned ? "Desfijar" : "Fijar arriba"}
          </MenuItem>
          <MenuItem icon={<Star />} onSelect={() => updateDoc(doc.id, { favorite: doc.favorite ? 0 : 1 })}>
            {doc.favorite ? "Quitar de favoritos" : "Añadir a favoritos"}
          </MenuItem>
          <MenuItem icon={<Copy />} onSelect={async () => { await duplicateDoc(doc.id); toast("Copia creada", "success"); }}>Duplicar</MenuItem>
          <MenuSeparator />
          <MenuItem icon={<Trash2 />} danger onSelect={async () => { await trashDoc(doc.id); toast("Movido a la papelera"); }}>
            Mover a la papelera
          </MenuItem>
        </MenuContent>
      </Menu>
    </div>
  );
}

function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3.5 flex items-center justify-between">
      <h2 className="text-[16px] font-semibold">{children}</h2>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Nuevo / Abrir / Papelera                                           */
/* ------------------------------------------------------------------ */

function NewSection() {
  return (
    <>
      <h1 className="mb-1 text-[26px] font-bold tracking-tight">Nuevo</h1>
      <p className="mb-7 text-muted">Elige una plantilla o empieza en blanco.</p>
      <SectionTitle>Documentos</SectionTitle>
      <div className="mb-9 grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-5">
        {TEMPLATES.filter((t) => t.kind === "document").map((t) => <TemplateCard key={t.id} tpl={t} />)}
      </div>
      <SectionTitle>Notas</SectionTitle>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-5">
        <button onClick={() => newNote()} className="group text-left">
          <div className="mb-2 grid aspect-[3/4] place-items-center rounded-[var(--radius)] border border-border bg-[#fffbea] text-[#d4a72c] transition-all group-hover:-translate-y-0.5 group-hover:border-accent">
            <StickyNote className="size-8" />
          </div>
          <div className="text-[13px] font-medium">Nota en blanco</div>
          <div className="text-[11.5px] text-muted">Apunte rápido</div>
        </button>
        {TEMPLATES.filter((t) => t.kind === "note").map((t) => <TemplateCard key={t.id} tpl={t} />)}
      </div>
    </>
  );
}

function OpenSection() {
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useApp((s) => s.toast);
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const { importFromFile } = await import("@/lib/io");
      const doc = await importFromFile(file);
      toast(`«${file.name}» importado`, "success");
      openDoc(doc);
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo importar el archivo", "error");
    }
  };
  return (
    <>
      <div className="mb-7 flex items-end justify-between">
        <div>
          <h1 className="mb-1 text-[26px] font-bold tracking-tight">Abrir</h1>
          <p className="text-muted">Todos tus documentos y notas guardados en este equipo.</p>
        </div>
        <Button
          variant="primary"
          icon={<Upload className="size-4" />}
          onClick={async () => {
            // En la app de escritorio, el diálogo de Windows recuerda la ruta para que «Guardar» la reemplace
            const files = await import("@/lib/files");
            if (!files.isDesktop()) return fileRef.current?.click();
            try {
              const doc = await files.openFileFromDisk();
              if (doc) openDoc(doc);
            } catch (e) {
              toast(e instanceof Error ? e.message : "No se pudo abrir el archivo", "error");
            }
          }}
        >
          Abrir archivo…
        </Button>
        <input ref={fileRef} type="file" accept={ACCEPTED_IMPORTS} hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files[0]); }}
        className="mb-8 grid place-items-center rounded-[calc(var(--radius)+4px)] border-2 border-dashed border-border px-6 py-8 text-center text-muted"
      >
        <Upload className="mb-2 size-6" />
        <p className="text-[13.5px]">Arrastra aquí un archivo <b>.docx</b>, <b>.lumen</b>, <b>.md</b>, <b>.html</b> o <b>.txt</b> para abrirlo</p>
      </div>
      <RecentList title="Todos los archivos" />
    </>
  );
}

function TrashSection() {
  const toast = useApp((s) => s.toast);
  const docs = useLiveQuery(() => db.docs.filter((d) => d.deletedAt !== null).reverse().sortBy("deletedAt"), []);
  const emptyTrash = async () => {
    if (!docs?.length) return;
    if (!confirm(`¿Eliminar definitivamente ${docs.length} elemento(s)? Esta acción no se puede deshacer.`)) return;
    await db.docs.bulkDelete(docs.map((d) => d.id));
    toast("Papelera vaciada", "success");
  };
  return (
    <>
      <div className="mb-7 flex items-end justify-between">
        <div>
          <h1 className="mb-1 text-[26px] font-bold tracking-tight">Papelera</h1>
          <p className="text-muted">Recupera documentos borrados o elimínalos para siempre.</p>
        </div>
        <Button variant="outline" icon={<Trash2 className="size-4" />} onClick={emptyTrash} disabled={!docs?.length}>
          Vaciar papelera
        </Button>
      </div>
      <div className="overflow-hidden rounded-[calc(var(--radius)+4px)] border border-border bg-surface">
        {docs?.length === 0 && <div className="px-4 py-12 text-center text-muted">La papelera está vacía.</div>}
        {docs?.map((d) => (
          <div key={d.id} className="flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-0">
            <DocIcon doc={d} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-medium">{displayTitle(d)}</div>
              <div className="text-[12px] text-muted">Eliminado {relativeTime(d.deletedAt!)}</div>
            </div>
            <Tooltip label="Restaurar">
              <Button size="sm" variant="ghost" icon={<RotateCcw className="size-4" />} onClick={() => restoreDoc(d.id)}>Restaurar</Button>
            </Tooltip>
            <Button
              size="sm"
              variant="ghost"
              className="text-red-500"
              onClick={() => { if (confirm("¿Eliminar definitivamente?")) deleteForever(d.id); }}
            >
              Eliminar
            </Button>
          </div>
        ))}
      </div>
    </>
  );
}
