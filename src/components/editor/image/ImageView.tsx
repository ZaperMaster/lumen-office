import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import {
  AlignCenter, Crop, FlipHorizontal2, PanelLeft, PanelRight, RotateCcw, RotateCw, Trash2, Type, Undo2,
} from "lucide-react";
import { cropImage, flipImage, rotateImage, type CropRect } from "@/lib/imageOps";
import { useApp } from "@/store/app";
import { CropDialog } from "@/components/editor/image/CropDialog";
import { Button, Input, Popover, PopoverContent, PopoverTrigger, Tooltip, cn } from "@/components/ui";

export type ImageAlign = "left" | "center" | "right";

const MIN_WIDTH = 40;

/** Vista de una imagen en el editor: tamaño, ajuste al texto, recorte y giro. */
export function ImageView({ node, updateAttributes, deleteNode, selected, editor }: NodeViewProps) {
  const { src, alt, width, align } = node.attrs as { src: string; alt: string | null; width: number | null; align: ImageAlign };
  const imgRef = useRef<HTMLImageElement>(null);
  const [liveWidth, setLiveWidth] = useState<number | null>(null);
  const [cropping, setCropping] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useApp((s) => s.toast);
  const editable = editor.isEditable;

  /** Ancho disponible en el documento (para no salirse de la página). */
  const maxWidth = () => editor.view.dom.clientWidth || 800;

  /* ---------------- Redimensionar con los tiradores ---------------- */
  const startResize = (dir: 1 | -1) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const img = imgRef.current!;
    // Escala real en pantalla (zoom del documento)
    const scale = img.getBoundingClientRect().width / img.offsetWidth || 1;
    const startX = e.clientX;
    const startW = img.offsetWidth;
    let current = startW;
    const move = (ev: PointerEvent) => {
      current = Math.round(Math.min(maxWidth(), Math.max(MIN_WIDTH, startW + (dir * (ev.clientX - startX)) / scale)));
      setLiveWidth(current);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setLiveWidth(null);
      updateAttributes({ width: current });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const setPercent = (p: number) => updateAttributes({ width: Math.round((maxWidth() * p) / 100) });

  /* ---------------- Edición con canvas ---------------- */
  const run = async (fn: () => Promise<Partial<{ src: string; width: number | null }>>) => {
    setBusy(true);
    try {
      updateAttributes(await fn());
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo editar la imagen", "error");
    } finally {
      setBusy(false);
    }
  };

  const applyCrop = (rect: CropRect) => {
    setCropping(false);
    const shownWidth = imgRef.current?.offsetWidth ?? null;
    void run(async () => {
      const out = await cropImage(src, rect);
      // Mantiene la escala visual: la parte recortada se ve del mismo tamaño que antes
      return { src: out.src, width: shownWidth ? Math.max(MIN_WIDTH, Math.round(shownWidth * rect.w)) : null };
    });
  };

  const rotate = (dir: 1 | -1) =>
    run(async () => {
      const out = await rotateImage(src, dir);
      const w = imgRef.current?.offsetWidth;
      const h = imgRef.current?.offsetHeight;
      // Al girar, el nuevo ancho es el alto que tenía (sin salirse de la página)
      return { src: out.src, width: w && h ? Math.min(maxWidth(), Math.round(h)) : null };
    });

  const shown = liveWidth ?? width;

  // La barra va encima de la imagen; si no cabe (imagen pegada arriba), se coloca debajo
  const [toolbarBelow, setToolbarBelow] = useState(false);
  useLayoutEffect(() => {
    if (!selected || !imgRef.current) return;
    const scroller = imgRef.current.closest(".print-area, .overflow-y-auto");
    const top = scroller ? scroller.getBoundingClientRect().top : 0;
    setToolbarBelow(imgRef.current.getBoundingClientRect().top - top < 56);
  }, [selected, shown]);

  return (
    <NodeViewWrapper className="image-frame" data-align={align}>
      <div className={cn("relative inline-block max-w-full align-top", selected && editable && "image-selected")}>
        <img
          ref={imgRef}
          src={src}
          alt={alt ?? ""}
          title={alt ?? undefined}
          data-drag-handle
          draggable
          style={{ width: shown ? `${shown}px` : undefined }}
          className={cn("block h-auto max-w-full rounded-[4px]", busy && "opacity-50")}
        />

        {selected && editable && (
          <>
            {/* Tiradores de tamaño (las cuatro esquinas) */}
            {(["nw", "ne", "sw", "se"] as const).map((c) => (
              <span
                key={c}
                onPointerDown={startResize(c.includes("w") ? -1 : 1)}
                className={cn(
                  "no-print absolute z-10 size-3 rounded-full border-2 border-white bg-[var(--accent)] shadow",
                  c === "nw" && "-top-1.5 -left-1.5 cursor-nwse-resize",
                  c === "ne" && "-top-1.5 -right-1.5 cursor-nesw-resize",
                  c === "sw" && "-bottom-1.5 -left-1.5 cursor-nesw-resize",
                  c === "se" && "-right-1.5 -bottom-1.5 cursor-nwse-resize",
                )}
              />
            ))}
            {liveWidth && (
              <span className="no-print absolute right-1 bottom-1 rounded bg-black/70 px-1.5 py-0.5 text-[11px] text-white">{liveWidth} px</span>
            )}

            {/* Barra de herramientas de la imagen */}
            <div
              contentEditable={false}
              onMouseDown={(e) => e.preventDefault()}
              className={cn("no-print absolute left-1/2 z-20 flex -translate-x-1/2 items-center", toolbarBelow ? "-bottom-11" : "-top-11", "gap-0.5 rounded-[var(--radius)] border border-border bg-surface p-1 text-text shadow-soft")}
              style={{ fontFamily: "var(--ui-font)", fontSize: 13, lineHeight: 1 }}
            >
              <ToolBtn label="Texto alrededor, imagen a la izquierda" active={align === "left"} onClick={() => updateAttributes({ align: "left" })}>
                <PanelLeft className="size-4" />
              </ToolBtn>
              <ToolBtn label="Centrada, sin texto alrededor" active={align === "center"} onClick={() => updateAttributes({ align: "center" })}>
                <AlignCenter className="size-4" />
              </ToolBtn>
              <ToolBtn label="Texto alrededor, imagen a la derecha" active={align === "right"} onClick={() => updateAttributes({ align: "right" })}>
                <PanelRight className="size-4" />
              </ToolBtn>
              <Sep />
              {[25, 50, 75, 100].map((p) => (
                <Tooltip key={p} label={`${p} % del ancho de la página`}>
                  <button onClick={() => setPercent(p)} className="h-7 rounded-md px-1.5 text-[12px] hover:bg-surface-2">
                    {p}%
                  </button>
                </Tooltip>
              ))}
              <ToolBtn label="Tamaño original" onClick={() => updateAttributes({ width: null })}>
                <Undo2 className="size-4" />
              </ToolBtn>
              <Sep />
              <ToolBtn label="Recortar" onClick={() => setCropping(true)}>
                <Crop className="size-4" />
              </ToolBtn>
              <ToolBtn label="Girar a la izquierda" onClick={() => rotate(-1)}>
                <RotateCcw className="size-4" />
              </ToolBtn>
              <ToolBtn label="Girar a la derecha" onClick={() => rotate(1)}>
                <RotateCw className="size-4" />
              </ToolBtn>
              <ToolBtn label="Voltear horizontalmente" onClick={() => run(async () => ({ src: await flipImage(src) }))}>
                <FlipHorizontal2 className="size-4" />
              </ToolBtn>
              <Sep />
              <AltTextButton alt={alt} onSave={(v) => updateAttributes({ alt: v || null })} />
              <ToolBtn label="Eliminar imagen" onClick={deleteNode}>
                <Trash2 className="size-4 text-red-500" />
              </ToolBtn>
            </div>
          </>
        )}
      </div>
      {cropping && <CropDialog src={src} open={cropping} onOpenChange={setCropping} onApply={applyCrop} />}
    </NodeViewWrapper>
  );
}

function ToolBtn({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip label={label}>
      <button
        onClick={onClick}
        aria-label={label}
        className={cn("grid size-7 place-items-center rounded-md", active ? "bg-accent-soft text-accent" : "hover:bg-surface-2")}
      >
        {children}
      </button>
    </Tooltip>
  );
}

const Sep = () => <span className="mx-0.5 h-5 w-px bg-border" />;

function AltTextButton({ alt, onSave }: { alt: string | null; onSave: (v: string) => void }) {
  const [value, setValue] = useState(alt ?? "");
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setValue(alt ?? "");
      }}
    >
      <Tooltip label="Texto alternativo (descripción para lectores de pantalla)">
        <PopoverTrigger asChild>
          <button aria-label="Texto alternativo" className={cn("grid size-7 place-items-center rounded-md hover:bg-surface-2", alt && "text-accent")}>
            <Type className="size-4" />
          </button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent className="w-[320px]">
        <div className="mb-2 text-[12.5px] font-medium">Describe la imagen</div>
        <div className="flex gap-2">
          <Input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onSave(value.trim());
                setOpen(false);
              }
            }}
            placeholder="p. ej. Gráfico de ventas de 2026"
          />
          <Button
            variant="primary"
            onClick={() => {
              onSave(value.trim());
              setOpen(false);
            }}
          >
            Guardar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
