import { useState } from "react";
import { BadgeCheck, Download, ExternalLink, KeyRound, Loader2, ShoppingCart } from "lucide-react";
import { BUY_URL, CONTACT_URL, TRIAL_DAYS, activate, useLicense } from "@/lib/license";
import { exportBackup } from "@/lib/backup";
import { openExternal } from "@/lib/openExternal";
import { useApp } from "@/store/app";
import { Button, cn } from "@/components/ui";
import { Logo } from "@/components/Logo";

/** Campo para escribir o pegar la clave y activarla. */
export function LicenseKeyForm({ onDone }: { onDone?: () => void }) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useApp((s) => s.toast);
  const submit = async () => {
    setBusy(true);
    setError(null);
    const r = await activate(key);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    toast(`¡Gracias, ${r.info.name}! Lumen Office está activado.`, "success");
    setKey("");
    onDone?.();
  };
  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={key}
        onChange={(e) => {
          setKey(e.target.value);
          setError(null);
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter" && !e.shiftKey && key.trim()) {
            e.preventDefault();
            void submit();
          }
        }}
        rows={3}
        spellCheck={false}
        placeholder="Pega aquí tu clave de licencia (empieza por LUMEN1-)"
        className={cn(
          "w-full resize-none rounded-[var(--radius)] border bg-surface px-3 py-2 font-mono text-[12px] break-all outline-none focus:border-accent",
          error ? "border-red-400" : "border-border",
        )}
      />
      {error && <p className="text-[12.5px] text-red-500">{error}</p>}
      <Button variant="primary" icon={busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />} disabled={!key.trim() || busy} onClick={() => void submit()}>
        Activar
      </Button>
    </div>
  );
}

export function buyLicense() {
  void openExternal(BUY_URL || CONTACT_URL);
}

/** Pantalla al terminar la prueba: activar, comprar o sacar una copia de los datos. */
export function LicenseScreen() {
  const info = useLicense((s) => s.info);
  return (
    <div data-tauri-drag-region className="grid h-full place-items-center overflow-y-auto bg-bg p-6">
      <div className="w-full max-w-[480px] animate-pop-in rounded-[calc(var(--radius)+8px)] border border-border bg-surface p-8 shadow-soft">
        <div className="mb-5 flex items-center gap-3">
          <Logo className="size-11" />
          <div>
            <h1 className="text-[20px] font-bold">La prueba gratuita ha terminado</h1>
            <p className="text-[13px] text-muted">Has usado Lumen Office durante {TRIAL_DAYS} días.</p>
          </div>
        </div>
        <p className="mb-5 text-[13.5px] leading-relaxed text-muted">
          Para seguir creando y editando documentos, hojas de cálculo y presentaciones, activa tu licencia. Tus archivos siguen guardados en este equipo y no
          se ha borrado nada.
        </p>
        <LicenseKeyForm />
        <div className="my-5 flex items-center gap-3 text-[12px] text-muted">
          <span className="h-px flex-1 bg-border" />
          ¿Aún no tienes licencia?
          <span className="h-px flex-1 bg-border" />
        </div>
        <Button variant="outline" className="w-full" icon={<ShoppingCart className="size-4" />} onClick={buyLicense}>
          {BUY_URL ? "Comprar una licencia" : "Cómo conseguir una licencia"}
          <ExternalLink className="size-3.5 opacity-60" />
        </Button>
        <button onClick={() => void exportBackup()} className="mx-auto mt-4 flex items-center gap-1.5 text-[12.5px] text-muted hover:text-text">
          <Download className="size-3.5" /> Exportar todos mis documentos (copia de seguridad)
        </button>
        {info && (
          <p className="mt-4 flex items-center gap-1.5 text-[12px] text-emerald-600">
            <BadgeCheck className="size-4" /> {info.name}
          </p>
        )}
      </div>
    </div>
  );
}
