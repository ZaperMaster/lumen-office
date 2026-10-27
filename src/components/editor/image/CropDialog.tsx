import { useRef, useState } from "react";
import type { CropRect } from "@/lib/imageOps";
import { Button, Dialog, Segmented, cn } from "@/components/ui";

type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw" | "move";
type Aspect = "free" | "1" | "4/3" | "16/9" | "3/4";

const ASPECTS: { value: Aspect; label: string }[] = [
  { value: "free", label: "Libre" },
  { value: "1", label: "1:1" },
  { value: "4/3", label: "4:3" },
  { value: "16/9", label: "16:9" },
  { value: "3/4", label: "3:4" },
];

/** Proporción ancho/alto en píxeles de cada opción */
const RATIO: Record<Aspect, number | null> = { free: null, "1": 1, "4/3": 4 / 3, "16/9": 16 / 9, "3/4": 3 / 4 };

const MIN = 0.04;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Ventana para recortar una imagen arrastrando un marco. */
export function CropDialog({
  src,
  open,
  onOpenChange,
  onApply,
}: {
  src: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onApply: (rect: CropRect) => void;
}) {
  const [rect, setRect] = useState<CropRect>({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
  const [aspect, setAspect] = useState<Aspect>("free");
  const [ratio, setRatio] = useState(1); // ancho/alto de la imagen mostrada
  const boxRef = useRef<HTMLDivElement>(null);

  /** Ajusta el marco a la proporción elegida, centrado. */
  const applyAspect = (a: Aspect) => {
    setAspect(a);
    if (a === "free") return;
    const target = RATIO[a]!;
    let w = 0.9;
    let h = (w * ratio) / target;
    if (h > 0.9) {
      h = 0.9;
      w = (h * target) / ratio;
    }
    setRect({ x: (1 - w) / 2, y: (1 - h) / 2, w, h });
  };

  const startDrag = (handle: Handle) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const box = boxRef.current!.getBoundingClientRect();
    const start = { x: e.clientX, y: e.clientY, rect };
    const target = RATIO[aspect];
    const fixed = target ? target / ratio : null; // ancho/alto en fracciones
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - start.x) / box.width;
      const dy = (ev.clientY - start.y) / box.height;
      const r = { ...start.rect };
      if (handle === "move") {
        r.x = clamp(r.x + dx, 0, 1 - r.w);
        r.y = clamp(r.y + dy, 0, 1 - r.h);
      } else {
        if (handle.includes("e")) r.w = clamp(start.rect.w + dx, MIN, 1 - r.x);
        if (handle.includes("s")) r.h = clamp(start.rect.h + dy, MIN, 1 - r.y);
        if (handle.includes("w")) {
          const x = clamp(start.rect.x + dx, 0, start.rect.x + start.rect.w - MIN);
          r.w = start.rect.w + (start.rect.x - x);
          r.x = x;
        }
        if (handle.includes("n")) {
          const y = clamp(start.rect.y + dy, 0, start.rect.y + start.rect.h - MIN);
          r.h = start.rect.h + (start.rect.y - y);
          r.y = y;
        }
        if (fixed) {
          // Mantiene la proporción a partir del ancho
          r.h = r.w / fixed;
          if (r.y + r.h > 1) {
            r.h = 1 - r.y;
            r.w = r.h * fixed;
          }
        }
      }
      setRect(r);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const handles: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
  const pos: Record<string, string> = {
    nw: "left-0 top-0 cursor-nwse-resize",
    n: "left-1/2 top-0 cursor-ns-resize",
    ne: "left-full top-0 cursor-nesw-resize",
    e: "left-full top-1/2 cursor-ew-resize",
    se: "left-full top-full cursor-nwse-resize",
    s: "left-1/2 top-full cursor-ns-resize",
    sw: "left-0 top-full cursor-nesw-resize",
    w: "left-0 top-1/2 cursor-ew-resize",
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Recortar imagen"
      description="Arrastra el marco o sus esquinas para elegir la zona que quieres conservar."
      className="w-[min(92vw,760px)]"
      footer={
        <>
          <Button variant="ghost" onClick={() => setRect({ x: 0, y: 0, w: 1, h: 1 })}>
            Restablecer
          </Button>
          <Button onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button variant="primary" onClick={() => onApply(rect)}>
            Recortar
          </Button>
        </>
      }
    >
      <div className="mb-3 flex justify-center">
        <Segmented value={aspect} onChange={applyAspect} options={ASPECTS} />
      </div>
      <div className="flex justify-center rounded-[var(--radius)] bg-[#111] p-4">
        <div ref={boxRef} className="relative select-none" style={{ touchAction: "none" }}>
          <img
            src={src}
            alt=""
            draggable={false}
            onLoad={(e) => setRatio(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)}
            className="block max-h-[52vh] max-w-full"
          />
          {/* Zona oscurecida fuera del recorte */}
          <div
            className="absolute"
            onPointerDown={startDrag("move")}
            style={{
              left: `${rect.x * 100}%`,
              top: `${rect.y * 100}%`,
              width: `${rect.w * 100}%`,
              height: `${rect.h * 100}%`,
              boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.55)",
              outline: "2px solid white",
              cursor: "move",
            }}
          >
            {/* Guías de tercios */}
            <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
              {Array.from({ length: 9 }, (_, i) => (
                <div key={i} className="border border-white/25" />
              ))}
            </div>
            {handles.map((h) => (
              <span
                key={h}
                onPointerDown={startDrag(h)}
                className={cn("absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-sm border-2 border-white bg-[var(--accent)]", pos[h])}
              />
            ))}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
