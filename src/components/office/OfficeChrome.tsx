import { useRef, type ReactNode } from "react";
import {
  ArrowLeft, BookOpen, FileDown, FilePlus2, FolderOpen, FolderSearch, House, Loader2, Moon, Presentation, Printer,
  Save, SaveAll, Settings, Sheet, StickyNote, Star, Sun,
} from "lucide-react";
import { updateDoc, type DocRecord } from "@/lib/db";
import { fileName, isDesktop, openFileFromDisk, revealInFolder } from "@/lib/files";
import { newDocument, newNote, newSheet, newSlides, openDoc } from "@/lib/actions";
import { getTheme } from "@/lib/themes";
import { useApp } from "@/store/app";
import { useSettings } from "@/store/settings";
import { SaveIndicator } from "@/components/editor/StatusBar";
import { Button, IconButton, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, SubMenu, Tooltip, cn } from "@/components/ui";
import { Logo } from "@/components/Logo";
import type { OfficeFiles } from "@/components/office/useOfficeDoc";

import { L } from "@/lib/i18n";
/* Barra superior y menú Archivo comunes a las hojas de cálculo y las presentaciones. */

export function OfficeHeader({
  doc,
  title,
  onTitle,
  placeholder,
  saveState,
  diskState,
  unsavedFile,
  files,
  icon,
  children,
}: {
  doc: DocRecord;
  title: string;
  onTitle: (t: string) => void;
  placeholder: string;
  saveState: "saved" | "saving";
  diskState: "idle" | "saving" | "error";
  unsavedFile: boolean;
  files: OfficeFiles;
  icon: ReactNode;
  children?: ReactNode;
}) {
  const s = useSettings();
  const navigate = useApp((st) => st.navigate);
  const openSettings = useApp((st) => st.openSettings);
  const dark = getTheme(s.themeId).dark;
  return (
    <header
      data-tauri-drag-region
      className="no-print flex h-11 shrink-0 items-center gap-2 border-b border-border bg-surface px-2"
      style={{ paddingRight: "calc(var(--wc) + 8px)" }}
    >
      <IconButton label={L("Volver al inicio")} onClick={() => navigate({ name: "home" })}>
        <ArrowLeft className="size-4" />
      </IconButton>
      <Logo className="size-6" />
      <input
        value={title}
        onChange={(e) => onTitle(e.target.value)}
        placeholder={placeholder}
        className="h-8 min-w-0 flex-1 rounded-md bg-transparent px-2 text-[14px] font-semibold outline-none hover:bg-surface-2 focus:bg-surface-2"
        aria-label={L("Título")}
      />
      <SaveIndicator state={saveState} />
      <IconButton label={doc.favorite ? L("Quitar de favoritos") : L("Añadir a favoritos")} onClick={() => updateDoc(doc.id, { favorite: doc.favorite ? 0 : 1 })}>
        <Star className={cn("size-4", doc.favorite === 1 && "fill-amber-400 text-amber-400")} />
      </IconButton>
      <IconButton label={dark ? L("Modo claro") : L("Modo oscuro")} onClick={() => s.set("themeId", dark ? "light" : "dark")}>
        {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </IconButton>
      <IconButton label={L("Configuración")} onClick={() => openSettings()}>
        <Settings className="size-4" />
      </IconButton>
      {doc.filePath && (
        <Tooltip
          label={
            diskState === "error"
              ? L("No se pudo guardar en {0}", doc.filePath)
              : unsavedFile
                ? s.fileAutoSave
                  ? L("Guardando en {0}…", doc.filePath)
                  : L("Cambios sin guardar en {0} (Ctrl+S)", doc.filePath)
                : L("Guardado en {0} · clic para ver la carpeta", doc.filePath)
          }
        >
          <button
            onClick={() => void revealInFolder(doc.filePath!).catch(() => {})}
            className="flex max-w-[220px] items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-muted hover:bg-surface-2 hover:text-text"
          >
            <span className="shrink-0 [&>svg]:size-3.5">{icon}</span>
            <span className="truncate">{fileName(doc.filePath)}</span>
            {diskState === "saving" ? (
              <Loader2 className="size-3 shrink-0 animate-spin" aria-label={L("Guardando en el archivo")} />
            ) : diskState === "error" ? (
              <span className="size-1.5 shrink-0 rounded-full bg-red-500" aria-label={L("Error al guardar en el archivo")} />
            ) : (
              unsavedFile && <span className="size-1.5 shrink-0 rounded-full bg-amber-500" aria-label={L("Cambios sin guardar en el archivo")} />
            )}
          </button>
        </Tooltip>
      )}
      <Tooltip label={doc.filePath ? L("Guardar en el archivo (Ctrl+S)") : L("Guardar en un archivo (Ctrl+S)")}>
        <Button size="sm" variant="outline" icon={<Save className="size-3.5" />} onClick={files.save}>
          {isDesktop() ? L("Guardar") : L("Descargar")}
        </Button>
      </Tooltip>
      {children}
    </header>
  );
}

export interface ExportItem {
  label: string;
  icon: ReactNode;
  onSelect: () => void;
}

export function OfficeFileMenu({
  files,
  saveLabel,
  exports,
  onPrint,
}: {
  files: OfficeFiles;
  /** Texto de «Descargar» en el navegador, p. ej. «(.xlsx)» */
  saveLabel: string;
  exports: ExportItem[];
  onPrint: () => void;
}) {
  const navigate = useApp((s) => s.navigate);
  const toast = useApp((s) => s.toast);
  const fileRef = useRef<HTMLInputElement>(null);
  const desktop = isDesktop();
  const openFile = async () => {
    if (!desktop) return fileRef.current?.click();
    try {
      const d = await openFileFromDisk();
      if (d) openDoc(d);
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
          <MenuItem icon={<BookOpen />} onSelect={() => navigate({ name: "home", section: "open" })}>{L("Archivos recientes")}</MenuItem>
          <MenuSeparator />
          <MenuItem icon={<Save />} shortcut="Ctrl+S" onSelect={files.save}>
            {files.filePath ? L("Guardar") : desktop ? L("Guardar…") : L("Descargar {0}", saveLabel)}
          </MenuItem>
          {desktop && <MenuItem icon={<SaveAll />} shortcut="F12" onSelect={files.saveAs}>{L("Guardar como…")}</MenuItem>}
          <SubMenu label={L("Exportar una copia")} icon={<FileDown />}>
            {exports.map((x) => (
              <MenuItem key={x.label} icon={x.icon} onSelect={x.onSelect}>{x.label}</MenuItem>
            ))}
          </SubMenu>
          <MenuItem icon={<Printer />} shortcut="Ctrl+P" onSelect={onPrint}>{L("Imprimir…")}</MenuItem>
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
        accept=".docx,.pdf,.lumen,.md,.markdown,.html,.htm,.txt,.xlsx,.csv,.pptx"
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

/** Grupo de la cinta con su etiqueta debajo. */
export function RGroup({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className="flex shrink-0 flex-col border-r border-border px-2.5 last:border-r-0">
      <div className={cn("flex flex-1 items-center gap-0.5", className)}>{children}</div>
      <div className="pt-0.5 text-center text-[10.5px] text-muted">{label}</div>
    </div>
  );
}

/** Botón grande de la cinta (icono arriba, texto debajo). */
export function RBig({ icon, label, onClick, active, disabled, title }: { icon: ReactNode; label: string; onClick?: () => void; active?: boolean; disabled?: boolean; title?: string }) {
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
      <span className="max-w-[80px] text-center">{label}</span>
    </button>
  );
  return title ? <Tooltip label={title}>{btn}</Tooltip> : btn;
}

/** Barra de pestañas de la cinta. */
export function RibbonTabs<T extends string>({
  tabs,
  active,
  onChange,
  left,
  right,
}: {
  tabs: { id: T; label: string; contextual?: boolean }[];
  active: T;
  onChange: (t: T) => void;
  left?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex h-9 items-end gap-0.5 px-2">
      {left}
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "relative h-8 rounded-t-md px-3.5 text-[13px] font-medium transition-colors",
            active === t.id ? "text-accent" : "text-muted hover:bg-surface-2 hover:text-text",
            t.contextual && active !== t.id && "text-emerald-600",
          )}
        >
          {t.label}
          {active === t.id && <span className="absolute inset-x-2.5 bottom-0 h-[2.5px] rounded-full bg-accent" />}
        </button>
      ))}
      {right && <div className="ml-auto flex items-center gap-1 pb-1">{right}</div>}
    </div>
  );
}

