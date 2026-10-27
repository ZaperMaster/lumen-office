import { useMemo, useState, type ReactNode } from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import { ChevronDown, Search, Ban } from "lucide-react";
import {
  BUNDLED_FONTS, CATEGORY_LABELS, FONT_SIZES, availableSystemFonts, fontNameFromCss, loadLocalFonts,
  type FontCategory, type FontDef,
} from "@/lib/fonts";
import { useSettings } from "@/store/settings";
import { useApp } from "@/store/app";
import { Input, Popover, PopoverClose, PopoverContent, PopoverTrigger, Tooltip, cn } from "@/components/ui";

/* ------------------------------------------------------------------ */
/*  Estado del editor (se recalcula en cada transacción)               */
/* ------------------------------------------------------------------ */

export function useEditorFlags(editor: Editor) {
  return useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const ts = e.getAttributes("textStyle");
      const heading = [1, 2, 3, 4].find((l) => e.isActive("heading", { level: l }));
      return {
        bold: e.isActive("bold"),
        italic: e.isActive("italic"),
        underline: e.isActive("underline"),
        strike: e.isActive("strike"),
        code: e.isActive("code"),
        subscript: e.isActive("subscript"),
        superscript: e.isActive("superscript"),
        link: e.isActive("link"),
        highlight: e.isActive("highlight"),
        bulletList: e.isActive("bulletList"),
        orderedList: e.isActive("orderedList"),
        taskList: e.isActive("taskList"),
        blockquote: e.isActive("blockquote"),
        codeBlock: e.isActive("codeBlock"),
        table: e.isActive("table"),
        alignLeft: e.isActive({ textAlign: "left" }),
        alignCenter: e.isActive({ textAlign: "center" }),
        alignRight: e.isActive({ textAlign: "right" }),
        alignJustify: e.isActive({ textAlign: "justify" }),
        heading: heading ?? 0,
        fontFamily: (ts.fontFamily as string | undefined) ?? null,
        fontSize: (ts.fontSize as string | undefined) ?? null,
        color: (ts.color as string | undefined) ?? null,
        lineHeight: (e.getAttributes("paragraph").lineHeight as string | undefined) ?? (ts.lineHeight as string | undefined) ?? null,
        highlightColor: (e.getAttributes("highlight").color as string | undefined) ?? null,
        canUndo: e.can().undo(),
        canRedo: e.can().redo(),
        empty: e.state.selection.empty,
      };
    },
  });
}

export type EditorFlags = ReturnType<typeof useEditorFlags>;

/* ------------------------------------------------------------------ */
/*  Selector de fuente                                                 */
/* ------------------------------------------------------------------ */

export function useAllFonts(): FontDef[] {
  const localFonts = useSettings((s) => s.localFonts);
  return useMemo(() => {
    const system = availableSystemFonts();
    const seen = new Set([...BUNDLED_FONTS, ...system].map((f) => f.name));
    return [...BUNDLED_FONTS, ...system, ...localFonts.filter((f) => !seen.has(f.name))];
  }, [localFonts]);
}

export function FontPicker({
  value,
  onChange,
  className,
  placeholder = "Fuente",
}: {
  value: string | null;
  onChange: (css: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const all = useAllFonts();
  const { recentFonts, pushRecentFont, localFonts, set } = useSettings();
  const toast = useApp((s) => s.toast);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const current = fontNameFromCss(value, all) ?? placeholder;

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const match = (f: FontDef) => !needle || f.name.toLowerCase().includes(needle);
    const out: { label: string; fonts: FontDef[] }[] = [];
    if (!needle && recentFonts.length) {
      const recent = recentFonts.map((css) => all.find((f) => f.css === css)).filter(Boolean) as FontDef[];
      if (recent.length) out.push({ label: "Recientes", fonts: recent });
    }
    (Object.keys(CATEGORY_LABELS) as FontCategory[]).forEach((cat) => {
      const fonts = all.filter((f) => f.source !== "local" && f.category === cat && match(f));
      if (fonts.length) out.push({ label: CATEGORY_LABELS[cat], fonts });
    });
    const local = all.filter((f) => f.source === "local" && match(f));
    if (local.length) out.push({ label: "Instaladas en el equipo", fonts: local });
    return out;
  }, [all, q, recentFonts]);

  const pick = (f: FontDef) => {
    onChange(f.css);
    pushRecentFont(f.css);
    setOpen(false);
    setQ("");
  };

  const loadLocal = async () => {
    try {
      const fonts = await loadLocalFonts();
      set("localFonts", fonts);
      toast(`${fonts.length} fuentes del sistema añadidas`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudieron leer las fuentes", "error");
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip label="Fuente">
        <PopoverTrigger asChild>
          <button
            className={cn(
              "flex h-8 w-[170px] items-center justify-between gap-1 rounded-md border border-border bg-surface px-2.5 text-[13px] hover:border-accent/50",
              className,
            )}
          >
            <span className="truncate" style={{ fontFamily: value ?? undefined }}>{current}</span>
            <ChevronDown className="size-3.5 shrink-0 text-muted" />
          </button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent className="w-[290px] p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="border-b border-border p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted" />
            <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar fuente…" className="h-8 pl-8 text-[13px]" />
          </div>
        </div>
        <div className="max-h-[360px] overflow-y-auto p-1">
          {groups.map((g) => (
            <div key={g.label} className="mb-1">
              <div className="px-2.5 pt-2 pb-1 text-[10.5px] font-semibold tracking-wider text-muted uppercase">{g.label}</div>
              {g.fonts.map((f) => (
                <button
                  key={g.label + f.name}
                  onClick={() => pick(f)}
                  className={cn(
                    "flex h-8 w-full items-center rounded-md px-2.5 text-left text-[15px] hover:bg-surface-2",
                    value === f.css && "bg-accent-soft text-accent",
                  )}
                  style={{ fontFamily: f.css }}
                >
                  {f.name}
                </button>
              ))}
            </div>
          ))}
          {groups.length === 0 && <div className="px-3 py-4 text-center text-[13px] text-muted">No se encontraron fuentes</div>}
        </div>
        <div className="border-t border-border p-2">
          <button onClick={loadLocal} className="w-full rounded-md px-2 py-1.5 text-left text-[12.5px] text-accent hover:bg-surface-2">
            {localFonts.length ? `Actualizar fuentes del equipo (${localFonts.length})` : "Cargar todas las fuentes del equipo…"}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ------------------------------------------------------------------ */
/*  Tamaño de fuente                                                   */
/* ------------------------------------------------------------------ */

export function parsePt(v: string | null | undefined): number | null {
  if (!v) return null;
  const n = parseFloat(v);
  if (Number.isNaN(n)) return null;
  return v.endsWith("px") ? Math.round((n * 0.75) * 2) / 2 : n;
}

export function FontSizePicker({ value, onChange }: { value: number; onChange: (pt: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft == null) return;
    const n = parseFloat(draft.replace(",", "."));
    if (!Number.isNaN(n) && n >= 1 && n <= 400) onChange(n);
    setDraft(null);
  };
  return (
    <Popover>
      <div className="flex h-8 items-center rounded-md border border-border bg-surface hover:border-accent/50">
        <Tooltip label="Tamaño de fuente">
          <input
            value={draft ?? String(value).replace(".", ",")}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commit(); }
              if (e.key === "ArrowUp") { e.preventDefault(); onChange(stepSize(value, 1)); }
              if (e.key === "ArrowDown") { e.preventDefault(); onChange(stepSize(value, -1)); }
            }}
            className="h-full w-10 bg-transparent pl-2 text-[13px] outline-none"
            aria-label="Tamaño de fuente"
          />
        </Tooltip>
        <PopoverTrigger asChild>
          <button className="grid h-full w-5 place-items-center text-muted" aria-label="Lista de tamaños">
            <ChevronDown className="size-3.5" />
          </button>
        </PopoverTrigger>
      </div>
      <PopoverContent className="max-h-[320px] w-[90px] overflow-y-auto p-1">
        {FONT_SIZES.map((s) => (
          <PopoverClose asChild key={s}>
            <button
              onClick={() => onChange(s)}
              className={cn("block w-full rounded px-2.5 py-1 text-left text-[13px] hover:bg-surface-2", s === value && "bg-accent-soft text-accent")}
            >
              {String(s).replace(".", ",")}
            </button>
          </PopoverClose>
        ))}
      </PopoverContent>
    </Popover>
  );
}

export function stepSize(current: number, dir: 1 | -1): number {
  if (dir > 0) return FONT_SIZES.find((s) => s > current) ?? current + 12;
  return [...FONT_SIZES].reverse().find((s) => s < current) ?? Math.max(1, current - 1);
}

/* ------------------------------------------------------------------ */
/*  Paleta de colores                                                  */
/* ------------------------------------------------------------------ */

const BASE_COLORS = ["#000000", "#434343", "#666666", "#999999", "#cccccc", "#ffffff", "#c00000", "#ff0000", "#ffc000", "#ffff00", "#92d050", "#00b050", "#00b0f0", "#0070c0", "#002060", "#7030a0"];
const THEME_COLORS = [
  ["#1f2937", "#e7e6e6", "#44546a", "#4472c4", "#ed7d31", "#a5a5a5", "#ffc000", "#5b9bd5", "#70ad47", "#7c3aed"],
];
function tint(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amt > 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
  else { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
  return "#" + [r, g, b].map((x) => Math.round(x).toString(16).padStart(2, "0")).join("");
}
const PALETTE_ROWS = [
  THEME_COLORS[0],
  ...[0.8, 0.6, 0.4, -0.25, -0.5].map((a) => THEME_COLORS[0].map((c) => tint(c, a))),
];
export const HIGHLIGHT_COLORS = ["#fff59d", "#c5f6c7", "#b3e5fc", "#f8bbd0", "#e1bee7", "#ffe0b2", "#d7ccc8", "#cfd8dc"];

export function ColorPalette({
  onPick,
  onClear,
  clearLabel = "Automático",
  colors,
}: {
  onPick: (c: string) => void;
  onClear: () => void;
  clearLabel?: string;
  colors?: string[];
}) {
  const [custom, setCustom] = useState("#6d4aff");
  return (
    <div className="w-[232px]">
      <PopoverClose asChild>
        <button onClick={onClear} className="mb-2 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] hover:bg-surface-2">
          <Ban className="size-3.5 text-muted" />
          {clearLabel}
        </button>
      </PopoverClose>
      {colors ? (
        <div className="grid grid-cols-8 gap-1.5">
          {colors.map((c) => <Swatch key={c} color={c} onPick={onPick} big />)}
        </div>
      ) : (
        <>
          <div className="mb-1 text-[10.5px] font-semibold tracking-wider text-muted uppercase">Colores del tema</div>
          <div className="flex flex-col gap-0.5">
            {PALETTE_ROWS.map((row, i) => (
              <div key={i} className={cn("grid grid-cols-10 gap-0.5", i === 0 && "mb-1")}>
                {row.map((c) => <Swatch key={c + i} color={c} onPick={onPick} />)}
              </div>
            ))}
          </div>
          <div className="mt-2.5 mb-1 text-[10.5px] font-semibold tracking-wider text-muted uppercase">Colores estándar</div>
          <div className="grid grid-cols-8 gap-1">
            {BASE_COLORS.map((c) => <Swatch key={c} color={c} onPick={onPick} big />)}
          </div>
        </>
      )}
      <div className="mt-3 flex items-center gap-2 border-t border-border pt-2.5">
        <input type="color" value={custom} onChange={(e) => setCustom(e.target.value)} className="h-7 w-9 cursor-pointer rounded border border-border bg-transparent" aria-label="Color personalizado" />
        <PopoverClose asChild>
          <button onClick={() => onPick(custom)} className="flex-1 rounded-md px-2 py-1 text-left text-[12.5px] hover:bg-surface-2">
            Usar color personalizado
          </button>
        </PopoverClose>
      </div>
    </div>
  );
}

function Swatch({ color, onPick, big }: { color: string; onPick: (c: string) => void; big?: boolean }) {
  return (
    <PopoverClose asChild>
      <button
        onClick={() => onPick(color)}
        title={color}
        className={cn("rounded-[3px] border border-black/10 transition-transform hover:scale-125 hover:ring-2 hover:ring-accent", big ? "size-6" : "size-[20px]")}
        style={{ background: color }}
      />
    </PopoverClose>
  );
}

/** Botón dividido: aplica el último color con un clic y abre la paleta con la flecha. */
export function ColorButton({
  label,
  icon,
  color,
  onApply,
  onClear,
  clearLabel,
  colors,
}: {
  label: string;
  icon: ReactNode;
  color: string;
  onApply: (c: string) => void;
  onClear: () => void;
  clearLabel?: string;
  colors?: string[];
}) {
  return (
    <Popover>
      <div className="flex items-center rounded-md hover:bg-surface-2">
        <Tooltip label={label}>
          <button onClick={() => onApply(color)} className="flex h-8 w-7 flex-col items-center justify-center pl-1" aria-label={label}>
            <span className="[&>svg]:size-4">{icon}</span>
            <span className="mt-0.5 h-[3px] w-4 rounded-sm" style={{ background: color }} />
          </button>
        </Tooltip>
        <PopoverTrigger asChild>
          <button className="grid h-8 w-4 place-items-center text-muted" aria-label={`Más colores: ${label}`}>
            <ChevronDown className="size-3" />
          </button>
        </PopoverTrigger>
      </div>
      <PopoverContent>
        <ColorPalette onPick={onApply} onClear={onClear} clearLabel={clearLabel} colors={colors} />
      </PopoverContent>
    </Popover>
  );
}

/* ------------------------------------------------------------------ */
/*  Insertar tabla (rejilla)                                           */
/* ------------------------------------------------------------------ */

export function TableGridPicker({ onPick }: { onPick: (rows: number, cols: number) => void }) {
  const [hover, setHover] = useState<[number, number]>([0, 0]);
  const R = 8, C = 10;
  return (
    <div>
      <div className="mb-2 text-[12.5px] font-medium">{hover[0] ? `Tabla de ${hover[1]} × ${hover[0]}` : "Insertar tabla"}</div>
      <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${C}, 18px)` }} onMouseLeave={() => setHover([0, 0])}>
        {Array.from({ length: R * C }, (_, i) => {
          const r = Math.floor(i / C) + 1, c = (i % C) + 1;
          const on = r <= hover[0] && c <= hover[1];
          return (
            <PopoverClose asChild key={i}>
              <button
                onMouseEnter={() => setHover([r, c])}
                onClick={() => onPick(r, c)}
                className={cn("size-[18px] rounded-[3px] border", on ? "border-accent bg-accent-soft" : "border-border bg-surface")}
                aria-label={`${c} columnas por ${r} filas`}
              />
            </PopoverClose>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Galería de estilos                                                 */
/* ------------------------------------------------------------------ */

export const STYLES: { id: string; label: string; apply: (e: Editor) => void; active: (f: EditorFlags) => boolean; preview: string }[] = [
  { id: "normal", label: "Normal", apply: (e) => e.chain().focus().setParagraph().run(), active: (f) => !f.heading && !f.blockquote && !f.codeBlock, preview: "text-[13px]" },
  { id: "h1", label: "Título 1", apply: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(), active: (f) => f.heading === 1, preview: "text-[17px] font-bold" },
  { id: "h2", label: "Título 2", apply: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(), active: (f) => f.heading === 2, preview: "text-[15px] font-semibold" },
  { id: "h3", label: "Título 3", apply: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(), active: (f) => f.heading === 3, preview: "text-[14px] font-semibold" },
  { id: "h4", label: "Título 4", apply: (e) => e.chain().focus().toggleHeading({ level: 4 }).run(), active: (f) => f.heading === 4, preview: "text-[13px] font-semibold" },
  { id: "quote", label: "Cita", apply: (e) => e.chain().focus().toggleBlockquote().run(), active: (f) => f.blockquote, preview: "text-[13px] italic border-l-2 border-accent pl-1.5" },
  { id: "code", label: "Código", apply: (e) => e.chain().focus().toggleCodeBlock().run(), active: (f) => f.codeBlock, preview: "font-mono text-[12px]" },
];

export function StyleGallery({ editor, flags }: { editor: Editor; flags: EditorFlags }) {
  return (
    <div className="flex h-[52px] items-stretch gap-1 overflow-hidden">
      {STYLES.map((s) => (
        <button
          key={s.id}
          onClick={() => s.apply(editor)}
          className={cn(
            "flex w-[76px] shrink-0 flex-col justify-between rounded-md border px-2 py-1.5 text-left transition-colors",
            s.active(flags) ? "border-accent bg-accent-soft" : "border-transparent bg-surface-2/60 hover:border-border hover:bg-surface-2",
          )}
        >
          <span className={cn("truncate leading-tight", s.preview)}>AaBb</span>
          <span className="truncate text-[10.5px] text-muted">{s.label}</span>
        </button>
      ))}
    </div>
  );
}
