import { useEffect, useState } from "react";
import { Check, Download, Globe, Loader2, Trash2 } from "lucide-react";
import { L, availableLanguages, installedLanguages, keepSpanish, languageChosen, removeLanguage, setLanguage, uiLanguage, type Language } from "@/lib/i18n";
import { Button, Dialog, cn } from "@/components/ui";
import { useSettings } from "@/store/settings";

/** Idioma de las respuestas de la IA que corresponde a cada idioma de la app */
const AI_LANGUAGE: Record<string, string> = { es: "español", en: "inglés", fr: "francés", de: "alemán", it: "italiano", pt: "portugués", ca: "catalán", zh: "chino", ja: "japonés" };

/** Lista de idiomas: el elegido, los descargados y los que se pueden descargar. */
export function LanguageList({ manage }: { manage?: boolean }) {
  const [langs, setLangs] = useState<Language[] | null>(null);
  const [installed, setInstalled] = useState(installedLanguages);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const current = uiLanguage().code;

  useEffect(() => {
    void availableLanguages().then(setLangs);
  }, []);

  const choose = async (l: Language) => {
    if (l.code === current) return;
    setBusy(l.code);
    setError(null);
    try {
      // La IA también responde en el idioma elegido
      if (AI_LANGUAGE[l.code]) useSettings.getState().set("aiLanguage", AI_LANGUAGE[l.code]);
      // Recarga la app ya en el idioma elegido
      await setLanguage(l);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  };

  if (!langs) {
    return (
      <div className="flex items-center gap-2 py-6 text-[13px] text-muted">
        <Loader2 className="size-4 animate-spin" /> {L("Buscando idiomas…")}
      </div>
    );
  }
  return (
    <div>
      <div className="grid gap-1.5">
        {langs.map((l) => {
          const isCurrent = l.code === current;
          const here = l.code === "es" || installed.includes(l.code);
          return (
            <div
              key={l.code}
              role="button"
              tabIndex={0}
              onClick={() => void choose(l)}
              onKeyDown={(e) => e.key === "Enter" && void choose(l)}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-[var(--radius)] border px-3.5 py-2.5 text-left transition-colors",
                isCurrent ? "border-accent bg-accent/8" : "border-border hover:bg-surface-2",
              )}
            >
              <Globe className={cn("size-4 shrink-0", isCurrent ? "text-accent" : "text-muted")} />
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-medium">{l.name}</div>
                <div className="text-[11.5px] text-muted">
                  {l.code === "es" ? L("Incluido en la app") : here ? L("Descargado en este equipo") : l.size ? L("Se descarga al elegirlo (unos {0} KB)", l.size) : L("Se descarga al elegirlo")}
                </div>
              </div>
              {busy === l.code ? (
                <Loader2 className="size-4 animate-spin text-accent" />
              ) : isCurrent ? (
                <Check className="size-4 text-accent" />
              ) : !here ? (
                <Download className="size-4 text-muted" />
              ) : manage && l.code !== "es" ? (
                <button
                  title={L("Borrar este idioma del equipo")}
                  className="rounded p-1 text-muted hover:bg-surface-3 hover:text-red-500"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeLanguage(l.code);
                    setInstalled(installedLanguages());
                  }}
                >
                  <Trash2 className="size-4" />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      {error && <p className="mt-3 text-[12.5px] text-red-500">{error} {L("Comprueba la conexión a internet e inténtalo de nuevo.")}</p>}
    </div>
  );
}

/** La primera vez que se abre la app: elegir idioma. */
export function FirstRunLanguage() {
  const [open, setOpen] = useState(() => !languageChosen());
  if (!open) return null;
  const close = () => {
    keepSpanish();
    setOpen(false);
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && close()}
      title={L("Idioma · Language")}
      description={L("Elige el idioma de la app. Solo se descarga el que elijas; podrás cambiarlo en Configuración.")}
      footer={<Button variant="primary" onClick={close}>{L("Continuar en español")}</Button>}
    >
      <LanguageList />
    </Dialog>
  );
}
