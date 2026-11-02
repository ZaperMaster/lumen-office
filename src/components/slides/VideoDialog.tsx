import { useRef, useState } from "react";
import { saveAs } from "file-saver";
import { Film } from "lucide-react";
import type { Deck } from "@/lib/slides/model";
import { exportVideo, type VideoOptions } from "@/lib/slides/video";
import { isDesktop, revealInFolder } from "@/lib/files";
import { safeFileName } from "@/lib/fileName";
import { useApp } from "@/store/app";
import { Button, Dialog } from "@/components/ui";

import { L } from "@/lib/i18n";
/** Guardar la presentación como vídeo (MP4), con opciones y progreso. */
export function VideoDialog({ deck, title, onClose }: { deck: Deck; title: string; onClose: () => void }) {
  const toast = useApp((s) => s.toast);
  const [opts, setOpts] = useState<VideoOptions>({ perSlide: 5, perStep: 1.5, height: 1080 });
  const [progress, setProgress] = useState<{ p: number; label: string } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const seconds = deck.slides.length * opts.perSlide;

  const start = async () => {
    const ctrl = new AbortController();
    abort.current = ctrl;
    setProgress({ p: 0, label: L("Empezando…") });
    try {
      const { blob, ext } = await exportVideo(deck, opts, (p, label) => setProgress({ p, label }), ctrl.signal);
      const name = `${safeFileName(title || "Presentación")}.${ext}`;
      if (!isDesktop()) {
        saveAs(blob, name);
        toast(L("Descargado «{0}»", name), "success");
      } else {
        const { save } = await import("@tauri-apps/plugin-dialog");
        const picked = await save({ title: L("Guardar el vídeo"), defaultPath: name, filters: [{ name: L("Vídeo"), extensions: [ext] }] });
        if (picked) {
          const path = picked.toLowerCase().endsWith(`.${ext}`) ? picked : `${picked}.${ext}`;
          const { writeFile } = await import("@tauri-apps/plugin-fs");
          await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
          toast(L("Vídeo guardado"), "success", { detail: path, action: { label: L("Mostrar en la carpeta"), onClick: () => void revealInFolder(path).catch(() => {}) } });
        }
      }
      onClose();
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast(L("No se pudo crear el vídeo"), "error", { detail: String(e) });
      setProgress(null);
    }
  };

  const busy = progress !== null;
  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (o) return;
        abort.current?.abort();
        onClose();
      }}
      title={L("Guardar como vídeo")}
      description={L("Cada diapositiva y cada animación aparecen una tras otra, con un fundido.")}
      footer={
        busy ? (
          <Button variant="ghost" onClick={() => abort.current?.abort()}>{L("Cancelar")}</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>{L("Cancelar")}</Button>
            <Button variant="primary" icon={<Film />} onClick={() => void start()}>{L("Crear vídeo")}</Button>
          </>
        )
      }
    >
      {busy ? (
        <div className="py-2">
          <div className="mb-2 text-[13px]">{progress.label}</div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full bg-accent transition-[width]" style={{ width: `${Math.round(progress.p * 100)}%` }} />
          </div>
          <p className="mt-3 text-[12px] text-muted">{L("El vídeo se graba en tiempo real: tarda lo mismo que dura. Puedes seguir usando el equipo.")}</p>
        </div>
      ) : (
        <div className="grid gap-3 text-[13px]">
          <label className="flex items-center justify-between gap-3">
            {L("Tiempo en cada diapositiva")}
            <select className="h-8 rounded-md border border-border bg-surface px-2" value={opts.perSlide} onChange={(e) => setOpts({ ...opts, perSlide: Number(e.target.value) })}>
              {[3, 5, 8, 10, 15].map((s) => <option key={s} value={s}>{s} {" "}{L("segundos")}</option>)}
            </select>
          </label>
          <label className="flex items-center justify-between gap-3">
            {L("Tiempo en cada animación")}
            <select className="h-8 rounded-md border border-border bg-surface px-2" value={opts.perStep} onChange={(e) => setOpts({ ...opts, perStep: Number(e.target.value) })}>
              {[1, 1.5, 2, 3].map((s) => <option key={s} value={s}>{String(s).replace(".", ",")} {" "}{L("segundos")}</option>)}
            </select>
          </label>
          <label className="flex items-center justify-between gap-3">
            {L("Calidad")}
            <select className="h-8 rounded-md border border-border bg-surface px-2" value={opts.height} onChange={(e) => setOpts({ ...opts, height: Number(e.target.value) as 720 | 1080 })}>
              <option value={1080}>{L("Full HD (1920 × 1080)")}</option>
              <option value={720}>{L("HD (1280 × 720)")}</option>
            </select>
          </label>
          <p className="text-[12px] text-muted">
            {L("Durará unos")}{" "} {seconds >= 60 ? `${Math.floor(seconds / 60)} min ${seconds % 60 ? `${seconds % 60} s` : ""}` : `${seconds} segundos`} {" "}{L("(más las animaciones).")}
          </p>
        </div>
      )}
    </Dialog>
  );
}
