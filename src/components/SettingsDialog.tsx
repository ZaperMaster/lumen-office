import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Cpu, Download, Eye, EyeOff, HardDrive, KeyRound, Keyboard, MemoryStick, Server, Trash2, Info, Palette, PenLine, FileText, Sparkles, User, Upload, RotateCcw } from "lucide-react";
import { RDialogRoot } from "@/components/ui/dialogPrimitives";
import { THEMES, ACCENT_PRESETS, getTheme } from "@/lib/themes";
import { LANGUAGES } from "@/lib/ai";
import { ANTHROPIC_MODEL_OPTIONS, LOCAL_MODELS, loadEngine, loadRemote, refreshCached, useLocalAI, webgpuAvailable } from "@/lib/localModels";
import { ModelProgress } from "@/components/ai/LocalAIStatus";
import { appVersion, useUpdater } from "@/lib/updater";
import { isDesktop } from "@/lib/files";
import { db, type DocRecord } from "@/lib/db";
import { MARGINS, PAGE_SIZES, useSettings, type Margins, type PageSize } from "@/store/settings";
import { useApp } from "@/store/app";
import { FontPicker, FontSizePicker } from "@/components/editor/controls";
import { Button, Dialog, Input, Kbd, Segmented, Slider, Switch, cn } from "@/components/ui";
import { Logo } from "@/components/Logo";

const TABS = [
  { id: "appearance", label: "Apariencia", icon: Palette },
  { id: "editor", label: "Editor", icon: PenLine },
  { id: "page", label: "Página", icon: FileText },
  { id: "ai", label: "Inteligencia artificial", icon: Sparkles },
  { id: "general", label: "General y datos", icon: User },
  { id: "shortcuts", label: "Atajos de teclado", icon: Keyboard },
  { id: "about", label: "Acerca de", icon: Info },
] as const;

export function SettingsDialog() {
  const { settingsOpen, settingsTab, closeSettings, openSettings } = useApp();
  return (
    <RDialogRoot open={settingsOpen} onOpenChange={(o) => !o && closeSettings()} title="Configuración">
      <div className="flex h-[min(640px,86vh)] w-[min(940px,94vw)]">
        <nav className="flex w-[220px] shrink-0 flex-col gap-0.5 border-r border-border bg-surface-2/50 p-3">
          <div className="mb-3 px-2 text-[16px] font-semibold">Configuración</div>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => openSettings(t.id)}
              className={cn(
                "flex h-9 items-center gap-2.5 rounded-[var(--radius)] px-2.5 text-left text-[13px] font-medium",
                settingsTab === t.id ? "bg-surface text-text shadow-sm" : "text-muted hover:bg-surface hover:text-text",
              )}
            >
              <t.icon className="size-4" />
              {t.label}
            </button>
          ))}
        </nav>
        <div className="min-w-0 flex-1 overflow-y-auto p-7">
          {settingsTab === "appearance" && <Appearance />}
          {settingsTab === "editor" && <EditorSettings />}
          {settingsTab === "page" && <PageSettings />}
          {settingsTab === "ai" && <AISettings />}
          {settingsTab === "general" && <General />}
          {settingsTab === "shortcuts" && <Shortcuts />}
          {settingsTab === "about" && <About />}
        </div>
      </div>
    </RDialogRoot>
  );
}

function H({ children, desc }: { children: ReactNode; desc?: ReactNode }) {
  return (
    <div className="mb-5">
      <h2 className="text-[19px] font-semibold">{children}</h2>
      {desc && <p className="mt-1 text-[13px] text-muted">{desc}</p>}
    </div>
  );
}

function Field({ label, desc, children }: { label: ReactNode; desc?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-border py-3.5 last:border-0">
      <div className="min-w-0">
        <div className="text-[13.5px] font-medium">{label}</div>
        {desc && <div className="mt-0.5 text-[12px] text-muted">{desc}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Appearance() {
  const s = useSettings();
  return (
    <>
      <H desc="Elige el tema y el color de acento de toda la aplicación.">Apariencia</H>
      <div className="mb-2 text-[12px] font-semibold tracking-wide text-muted uppercase">Tema</div>
      <div className="mb-7 grid grid-cols-[repeat(auto-fill,minmax(128px,1fr))] gap-3">
        {THEMES.map((t) => {
          const tk = t.tokens;
          const active = s.themeId === t.id;
          return (
            <button key={t.id} onClick={() => s.set("themeId", t.id)} className="group text-left">
              <div
                className={cn("relative mb-1.5 h-[78px] overflow-hidden rounded-[var(--radius)] border-2 transition-all", active ? "border-accent" : "border-border group-hover:border-accent/40")}
                style={{ background: tk.bg }}
              >
                <div className="absolute inset-y-0 left-0 w-7" style={{ background: tk.surface, borderRight: `1px solid ${tk.border}` }} />
                <div className="absolute top-2 right-2 left-9 h-2.5 rounded-sm" style={{ background: tk.surface }} />
                <div className="absolute top-6 right-4 bottom-0 left-11 rounded-t-sm p-1.5" style={{ background: tk.paper }}>
                  <div className="mb-1 h-1.5 w-2/3 rounded-sm" style={{ background: tk.paperText, opacity: 0.8 }} />
                  <div className="mb-1 h-1 w-full rounded-sm" style={{ background: tk.paperText, opacity: 0.3 }} />
                  <div className="h-1 w-4/5 rounded-sm" style={{ background: tk.paperText, opacity: 0.3 }} />
                </div>
                <div className="absolute bottom-2 left-2 size-3 rounded-full" style={{ background: s.accent ?? tk.accent }} />
                {active && (
                  <span className="absolute top-1.5 left-1.5 grid size-4 place-items-center rounded-full bg-accent text-accent-fg">
                    <Check className="size-3" />
                  </span>
                )}
              </div>
              <div className="text-[12.5px] font-medium">{t.name}</div>
            </button>
          );
        })}
      </div>

      <div className="mb-2 text-[12px] font-semibold tracking-wide text-muted uppercase">Color de acento</div>
      <div className="mb-7 flex flex-wrap items-center gap-2">
        <button
          onClick={() => s.set("accent", null)}
          className={cn("h-8 rounded-full border px-3 text-[12px] font-medium", s.accent === null ? "border-accent bg-accent-soft text-accent" : "border-border hover:bg-surface-2")}
        >
          Del tema
        </button>
        {ACCENT_PRESETS.map((c) => (
          <button
            key={c}
            onClick={() => s.set("accent", c)}
            className={cn("grid size-8 place-items-center rounded-full transition-transform hover:scale-110", s.accent === c && "ring-2 ring-offset-2 ring-offset-surface")}
            style={{ background: c, ["--tw-ring-color" as string]: c }}
            aria-label={`Acento ${c}`}
          >
            {s.accent === c && <Check className="size-4 text-white" />}
          </button>
        ))}
        <label className="relative grid size-8 cursor-pointer place-items-center overflow-hidden rounded-full border border-dashed border-border" title="Color personalizado">
          <span className="text-[16px] text-muted">+</span>
          <input type="color" value={s.accent ?? getTheme(s.themeId).tokens.accent} onChange={(e) => s.set("accent", e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
        </label>
      </div>

      <Field label="Fuente de la interfaz" desc="Tipografía de menús, botones y paneles.">
        <FontPicker value={s.uiFont} onChange={(css) => s.set("uiFont", css)} className="w-[200px]" />
      </Field>
      <Field label="Redondez de las esquinas" desc={`${s.radius} px`}>
        <Slider value={s.radius} onChange={(v) => s.set("radius", v)} min={0} max={18} className="w-48" />
      </Field>
      <Field label="Color de la hoja" desc="En temas oscuros, la hoja puede seguir el tema o ser siempre blanca como el papel.">
        <Segmented
          value={s.paperMode}
          onChange={(v) => s.set("paperMode", v)}
          options={[
            { value: "theme", label: "Según el tema" },
            { value: "white", label: "Siempre blanca" },
          ]}
        />
      </Field>
    </>
  );
}

function EditorSettings() {
  const s = useSettings();
  return (
    <>
      <H desc="Formato predeterminado para el texto de documentos y notas.">Editor</H>
      <div
        className="mb-6 rounded-[var(--radius)] border border-border bg-paper p-5 text-paper-text"
        style={{ fontFamily: s.fontFamily, fontSize: `${s.fontSize}pt`, lineHeight: s.lineHeight }}
      >
        <div className="mb-1 text-[1.6em] font-bold">Vista previa del texto</div>
        El veloz murciélago hindú comía feliz cardillo y kiwi. La cigüeña tocaba el saxofón detrás del palenque de paja. 0123456789
      </div>
      <Field label="Fuente predeterminada">
        <FontPicker value={s.fontFamily} onChange={(css) => s.set("fontFamily", css)} className="w-[220px]" />
      </Field>
      <Field label="Tamaño de fuente" desc="En puntos, como en Word.">
        <FontSizePicker value={s.fontSize} onChange={(v) => s.set("fontSize", v)} />
      </Field>
      <Field label="Interlineado" desc={String(s.lineHeight).replace(".", ",")}>
        <Slider value={s.lineHeight} onChange={(v) => s.set("lineHeight", v)} min={1} max={2.5} step={0.05} className="w-48" />
      </Field>
      <Field label="Espacio entre párrafos" desc={`${String(s.paraSpacing).replace(".", ",")} líneas`}>
        <Slider value={s.paraSpacing} onChange={(v) => s.set("paraSpacing", v)} min={0} max={2} step={0.1} className="w-48" />
      </Field>
      <Field label="Revisión ortográfica" desc="Subraya en rojo las palabras mal escritas.">
        <Switch checked={s.spellcheck} onChange={(v) => s.set("spellcheck", v)} />
      </Field>
      <Field label="Autoformato al escribir" desc="Convierte comillas en «», -- en —, (c) en ©, 1/2 en ½, etc.">
        <Switch checked={s.smartTyping} onChange={(v) => s.set("smartTyping", v)} />
      </Field>
    </>
  );
}

function PageSettings() {
  const s = useSettings();
  return (
    <>
      <H desc="Formato de la hoja en la vista de impresión, al imprimir y al exportar a Word.">Página</H>
      <Field label="Tamaño de papel">
        <select value={s.pageSize} onChange={(e) => s.set("pageSize", e.target.value as PageSize)} className="h-9 rounded-[var(--radius)] border border-border bg-surface px-2 text-[13px]">
          {(Object.keys(PAGE_SIZES) as PageSize[]).map((p) => <option key={p} value={p}>{PAGE_SIZES[p].label}</option>)}
        </select>
      </Field>
      <Field label="Orientación">
        <Segmented value={s.orientation} onChange={(v) => s.set("orientation", v)} options={[{ value: "portrait", label: "Vertical" }, { value: "landscape", label: "Horizontal" }]} />
      </Field>
      <Field label="Márgenes">
        <select value={s.margins} onChange={(e) => s.set("margins", e.target.value as Margins)} className="h-9 rounded-[var(--radius)] border border-border bg-surface px-2 text-[13px]">
          {(Object.keys(MARGINS) as Margins[]).map((m) => <option key={m} value={m}>{MARGINS[m].label}</option>)}
        </select>
      </Field>
      <Field label="Vista predeterminada">
        <Segmented
          value={s.viewMode}
          onChange={(v) => s.set("viewMode", v)}
          options={[{ value: "page", label: "Impresión" }, { value: "web", label: "Web" }, { value: "focus", label: "Enfoque" }]}
        />
      </Field>
    </>
  );
}

const API_PRESETS = [
  { name: "OpenAI", url: "https://api.openai.com/v1" },
  { name: "OpenRouter", url: "https://openrouter.ai/api/v1" },
  { name: "Groq", url: "https://api.groq.com/openai/v1" },
  { name: "DeepSeek", url: "https://api.deepseek.com/v1" },
  { name: "Mistral", url: "https://api.mistral.ai/v1" },
  { name: "LM Studio (local)", url: "http://localhost:1234/v1" },
];

function AISettings() {
  const s = useSettings();
  const local = useLocalAI();
  const toast = useApp((st) => st.toast);
  const [ollamaModels, setOllamaModels] = useState<string[] | null>(null);
  const [ollamaError, setOllamaError] = useState<string | null>(null);
  const [apiModels, setApiModels] = useState<string[] | null>(null);
  const [apiStatus, setApiStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [showKey, setShowKey] = useState(false);
  const gpu = webgpuAvailable();

  useEffect(() => {
    void refreshCached();
  }, []);

  const checkOllama = async () => {
    setOllamaError(null);
    try {
      const { listOllamaModels } = await loadRemote();
      const models = await listOllamaModels(useSettings.getState().ollamaUrl);
      setOllamaModels(models);
      const current = useSettings.getState().ollamaModel;
      if (models.length && !models.includes(current)) s.set("ollamaModel", models[0]);
    } catch {
      setOllamaModels(null);
      setOllamaError("No se encontró Ollama en esa dirección. Instálalo desde ollama.com y ábrelo.");
    }
  };

  useEffect(() => {
    if (s.aiEngine === "ollama") void checkOllama();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.aiEngine]);

  const loadApiModels = async () => {
    setApiStatus(null);
    try {
      const { listOpenAIModels } = await loadRemote();
      const models = await listOpenAIModels(s.openaiBaseUrl, s.openaiKey);
      setApiModels(models);
      if (models.length && !s.openaiModel) s.set("openaiModel", models[0]);
      setApiStatus({ ok: true, text: `Conectado · ${models.length} modelos disponibles` });
    } catch (e) {
      setApiModels(null);
      setApiStatus({ ok: false, text: e instanceof Error ? e.message : "No se pudo conectar" });
    }
  };

  const testApi = async () => {
    setApiStatus({ ok: true, text: "Probando…" });
    try {
      const { streamText } = await import("@/lib/ai");
      const reply = await streamText({ messages: [{ role: "user", content: "Responde solo con la palabra: listo" }], temperature: 0 });
      setApiStatus({ ok: true, text: `Funciona. Respuesta: «${reply.slice(0, 40)}»` });
    } catch (e) {
      setApiStatus({ ok: false, text: e instanceof Error ? e.message : "Error" });
    }
  };

  const engines = [
    { id: "webllm", title: "Integrado (local)", desc: "En tu tarjeta gráfica. Sin conexión y sin enviar nada.", icon: <HardDrive className="size-4" /> },
    { id: "ollama", title: "Ollama (local)", desc: "Modelos instalados con Ollama en este equipo.", icon: <Server className="size-4" /> },
    { id: "api", title: "Tu propia API", desc: "OpenAI, OpenRouter, Groq, Anthropic… No consume memoria.", icon: <KeyRound className="size-4" /> },
  ] as const;

  return (
    <>
      <H desc="Elige dónde se ejecuta la IA: en tu equipo (privado y sin conexión) o en un servicio con tu propia clave.">Inteligencia artificial</H>

      <div className="mb-2 text-[12px] font-semibold tracking-wide text-muted uppercase">Motor</div>
      <div className="mb-6 grid grid-cols-3 gap-2">
        {engines.map((e) => (
          <button
            key={e.id}
            onClick={() => s.set("aiEngine", e.id)}
            className={cn(
              "rounded-[var(--radius)] border p-3 text-left transition-colors",
              s.aiEngine === e.id ? "border-accent bg-accent-soft" : "border-border hover:bg-surface-2",
            )}
          >
            <div className="mb-1 flex items-center gap-2 text-[13px] font-medium">
              {e.icon}
              {e.title}
            </div>
            <div className="text-[11.5px] leading-snug text-muted">{e.desc}</div>
          </button>
        ))}
      </div>

      {s.aiEngine === "webllm" && (
        <>
          {!gpu && (
            <div className="mb-4 rounded-[var(--radius)] border border-red-500/30 bg-red-500/10 p-3 text-[13px]">
              Este equipo no admite WebGPU, así que el motor integrado no puede funcionar. Usa Ollama o tu propia API.
            </div>
          )}
          <div className="mb-2 text-[12px] font-semibold tracking-wide text-muted uppercase">Modelo</div>
          <div className="mb-3 grid gap-2">
            {LOCAL_MODELS.map((m) => {
              const selected = s.localModel === m.id;
              const downloaded = local.cached[m.id];
              const loaded = local.loadedModel === m.id;
              return (
                <div
                  key={m.id}
                  className={cn("flex items-center gap-3 rounded-[var(--radius)] border p-3 transition-colors", selected ? "border-accent bg-accent-soft" : "border-border")}
                >
                  <button onClick={() => s.set("localModel", m.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <span className={cn("grid size-4 shrink-0 place-items-center rounded-full border-2", selected ? "border-accent" : "border-border")}>
                      {selected && <span className="size-2 rounded-full bg-accent" />}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-[13.5px] font-medium">
                        {m.name}
                        {loaded ? (
                          <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10.5px] text-amber-600">En memoria</span>
                        ) : downloaded ? (
                          <span className="rounded-full bg-surface-3 px-1.5 py-0.5 text-[10.5px] text-muted">Descargado</span>
                        ) : null}
                      </div>
                      <div className="text-[12px] text-muted">{m.hint}</div>
                      <div className="mt-0.5 text-[11.5px] text-muted">
                        Descarga {m.sizeGB.toLocaleString("es-ES")} GB · memoria al usarlo {m.vramGB.toLocaleString("es-ES")} GB
                      </div>
                    </div>
                  </button>
                  {gpu && (
                    <div className="flex shrink-0 gap-1">
                      {loaded ? (
                        <Button size="sm" variant="outline" icon={<MemoryStick className="size-3.5" />} onClick={async () => { await (await loadEngine()).unloadModel(); toast("Memoria liberada", "success"); }}>
                          Liberar
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant={downloaded ? "outline" : "primary"}
                          icon={downloaded ? <Cpu className="size-3.5" /> : <Download className="size-3.5" />}
                          disabled={local.status === "loading"}
                          onClick={async () => {
                            s.set("localModel", m.id);
                            try {
                              await (await loadEngine()).ensureModel(m.id);
                              toast(`${m.name} listo`, "success");
                            } catch (e) {
                              toast(e instanceof Error ? e.message : "No se pudo cargar el modelo", "error");
                            }
                          }}
                        >
                          {downloaded ? "Cargar" : "Descargar"}
                        </Button>
                      )}
                      {downloaded && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-500"
                          icon={<Trash2 className="size-3.5" />}
                          disabled={local.status === "loading"}
                          aria-label={`Borrar ${m.name}`}
                          onClick={async () => {
                            if (!confirm(`¿Borrar ${m.name} de este equipo? Tendrás que volver a descargarlo para usarlo.`)) return;
                            await (await loadEngine()).deleteLocalModel(m.id);
                            toast("Modelo eliminado", "success");
                          }}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <ModelProgress className="mb-3" />
          {local.error && <p className="mb-3 text-[12.5px] text-red-500">{local.error}</p>}
          <p className="mb-4 text-[12px] leading-relaxed text-muted">
            La descarga solo hace falta una vez; después el modelo queda guardado y funciona sin conexión.
          </p>
        </>
      )}

      {s.aiEngine === "ollama" && (
        <div className="mb-4">
          <Field label="Dirección de Ollama" desc="Normalmente no hace falta cambiarla.">
            <div className="flex gap-2">
              <Input value={s.ollamaUrl} onChange={(e) => s.set("ollamaUrl", e.target.value)} className="w-56 font-mono text-[12.5px]" />
              <Button variant="outline" onClick={checkOllama}>
                Comprobar
              </Button>
            </div>
          </Field>
          <Field
            label="Modelo"
            desc={ollamaModels && !ollamaModels.length ? "No hay modelos. Instala uno, por ejemplo: ollama pull qwen2.5:7b" : "Modelos instalados en Ollama."}
          >
            <select
              value={s.ollamaModel}
              onChange={(e) => s.set("ollamaModel", e.target.value)}
              disabled={!ollamaModels?.length}
              className="h-9 min-w-[200px] rounded-[var(--radius)] border border-border bg-surface px-2 text-[13px]"
            >
              {!ollamaModels?.length && <option value="">—</option>}
              {ollamaModels?.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </Field>
          {ollamaError && <p className="mt-2 text-[12.5px] text-red-500">{ollamaError}</p>}
          {ollamaModels && <p className="mt-2 text-[12.5px] text-emerald-600">Conectado con Ollama · {ollamaModels.length} modelos</p>}
        </div>
      )}

      {s.aiEngine === "api" && (
        <div className="mb-4">
          <div className="mb-4 rounded-[var(--radius)] border border-amber-500/30 bg-amber-500/10 p-3 text-[12.5px] leading-relaxed">
            Con una API, el texto que mandes a la IA se envía a ese servicio y su uso se cobra en tu cuenta. La clave se guarda solo en este equipo.
          </div>
          <Field label="Proveedor">
            <Segmented
              value={s.apiProvider}
              onChange={(v) => {
                s.set("apiProvider", v);
                setApiStatus(null);
              }}
              options={[
                { value: "openai", label: "Compatible con OpenAI" },
                { value: "anthropic", label: "Anthropic (Claude)" },
              ]}
            />
          </Field>
          {s.apiProvider === "openai" ? (
            <>
              <Field label="Servicio" desc="Cualquier API compatible con OpenAI. Elige uno o escribe la dirección.">
                <div className="flex w-[300px] flex-col gap-1.5">
                  <select
                    value={API_PRESETS.find((p) => p.url === s.openaiBaseUrl)?.url ?? ""}
                    onChange={(e) => {
                      if (e.target.value) s.patch({ openaiBaseUrl: e.target.value, openaiModel: "" });
                      setApiModels(null);
                    }}
                    className="h-9 rounded-[var(--radius)] border border-border bg-surface px-2 text-[13px]"
                  >
                    <option value="">Personalizado</option>
                    {API_PRESETS.map((p) => (
                      <option key={p.url} value={p.url}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <Input value={s.openaiBaseUrl} onChange={(e) => s.set("openaiBaseUrl", e.target.value.trim())} className="font-mono text-[12px]" spellCheck={false} />
                </div>
              </Field>
              <Field label="Clave de API" desc="No hace falta para servidores locales como LM Studio.">
                <div className="flex w-[300px] gap-1.5">
                  <Input type={showKey ? "text" : "password"} value={s.openaiKey} onChange={(e) => s.set("openaiKey", e.target.value.trim())} placeholder="sk-…" autoComplete="off" spellCheck={false} className="font-mono" />
                  <Button variant="outline" onClick={() => setShowKey((v) => !v)} aria-label={showKey ? "Ocultar clave" : "Mostrar clave"} icon={showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />} />
                </div>
              </Field>
              <Field label="Modelo" desc="Escríbelo o cárgalo de la lista del servicio.">
                <div className="flex w-[300px] gap-1.5">
                  {apiModels?.length ? (
                    <select value={s.openaiModel} onChange={(e) => s.set("openaiModel", e.target.value)} className="h-9 min-w-0 flex-1 rounded-[var(--radius)] border border-border bg-surface px-2 text-[13px]">
                      {apiModels.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input value={s.openaiModel} onChange={(e) => s.set("openaiModel", e.target.value.trim())} placeholder="p. ej. gpt-4o-mini" spellCheck={false} className="font-mono" />
                  )}
                  <Button variant="outline" onClick={loadApiModels}>
                    Cargar
                  </Button>
                </div>
              </Field>
            </>
          ) : (
            <>
              <Field label="Clave de API de Anthropic" desc="Se crea en console.anthropic.com → API Keys.">
                <div className="flex w-[300px] gap-1.5">
                  <Input type={showKey ? "text" : "password"} value={s.anthropicKey} onChange={(e) => s.set("anthropicKey", e.target.value.trim())} placeholder="sk-ant-…" autoComplete="off" spellCheck={false} className="font-mono" />
                  <Button variant="outline" onClick={() => setShowKey((v) => !v)} aria-label={showKey ? "Ocultar clave" : "Mostrar clave"} icon={showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />} />
                </div>
              </Field>
              <Field label="Modelo">
                <select value={s.anthropicModel} onChange={(e) => s.set("anthropicModel", e.target.value)} className="h-9 w-[300px] rounded-[var(--radius)] border border-border bg-surface px-2 text-[13px]">
                  {ANTHROPIC_MODEL_OPTIONS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          )}
          <div className="mt-3 flex items-center gap-3">
            <Button variant="primary" onClick={testApi}>
              Probar conexión
            </Button>
            {apiStatus && <span className={cn("text-[12.5px]", apiStatus.ok ? "text-emerald-600" : "text-red-500")}>{apiStatus.text}</span>}
          </div>
        </div>
      )}

      {s.aiEngine !== "api" && (
        <>
          <Field
            label="Liberar memoria automáticamente"
            desc="Cuando no usas la IA, el modelo sale de la memoria. Al volver a usarla tarda unos segundos en cargarse."
          >
            <Switch checked={s.aiAutoUnload} onChange={(v) => s.set("aiAutoUnload", v)} label="Liberar memoria automáticamente" />
          </Field>
          {s.aiAutoUnload ? (
            <Field label="Liberar tras" desc="Tiempo sin usar la IA antes de liberar la memoria.">
              <select
                value={s.aiUnloadMinutes}
                onChange={(e) => s.set("aiUnloadMinutes", Number(e.target.value))}
                className="h-9 rounded-[var(--radius)] border border-border bg-surface px-2 text-[13px]"
              >
                {[1, 2, 5, 10, 30].map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <div className="my-2 rounded-[var(--radius)] border border-amber-500/30 bg-amber-500/10 p-3 text-[12.5px] leading-relaxed">
              <b>La IA responderá más rápido</b>, pero el modelo se queda cargado mientras la app esté abierta y ocupa unos{" "}
              {(LOCAL_MODELS.find((m) => m.id === s.localModel)?.vramGB ?? 3).toLocaleString("es-ES")} GB de memoria.
            </div>
          )}
        </>
      )}

      <Field label="Idioma de las respuestas">
        <select
          value={s.aiLanguage}
          onChange={(e) => s.set("aiLanguage", e.target.value)}
          className="h-9 rounded-[var(--radius)] border border-border bg-surface px-2 text-[13px] capitalize"
        >
          {LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </Field>
    </>
  );
}

function General() {
  const s = useSettings();
  const toast = useApp((st) => st.toast);
  const fileRef = useRef<HTMLInputElement>(null);

  const backup = async () => {
    const docs = await db.docs.toArray();
    const blob = new Blob([JSON.stringify({ app: "lumen", version: 1, exportedAt: new Date().toISOString(), docs }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `lumen-copia-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast(`Copia de seguridad con ${docs.length} elementos creada`, "success");
  };

  const restore = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as { app?: string; docs?: DocRecord[] };
      if (data.app !== "lumen" || !Array.isArray(data.docs)) throw new Error();
      await db.docs.bulkPut(data.docs);
      toast(`${data.docs.length} elementos restaurados`, "success");
    } catch {
      toast("El archivo no es una copia de seguridad válida", "error");
    }
  };

  return (
    <>
      <H desc="Tus datos se guardan en este equipo. Haz copias de seguridad de vez en cuando.">General y datos</H>
      <Field label="Tu nombre" desc="Se usa en el saludo y como autor al exportar.">
        <Input value={s.userName} onChange={(e) => s.set("userName", e.target.value)} placeholder="Nombre" className="w-56" />
      </Field>
      <Field
        label="Guardar automáticamente en el archivo"
        desc={
          s.fileAutoSave
            ? "Los documentos abiertos desde un archivo o guardados en uno se actualizan solos en el disco unos segundos después de cada cambio."
            : "Tendrás que pulsar Guardar (Ctrl+S). Si sales o cierras con cambios sin guardar, se te preguntará."
        }
      >
        <Switch checked={s.fileAutoSave} onChange={(v) => s.set("fileAutoSave", v)} label="Guardar automáticamente en el archivo" />
      </Field>
      <Field label="Copia de seguridad" desc="Descarga todos tus documentos y notas en un archivo.">
        <Button variant="outline" icon={<Download className="size-4" />} onClick={backup}>Exportar</Button>
      </Field>
      <Field label="Restaurar copia" desc="Importa un archivo de copia de seguridad de Lumen.">
        <Button variant="outline" icon={<Upload className="size-4" />} onClick={() => fileRef.current?.click()}>Importar</Button>
        <input ref={fileRef} type="file" accept=".json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) restore(f); }} />
      </Field>
      <Field label="Restablecer configuración" desc="Vuelve a los valores originales. No borra documentos, modelos descargados ni claves de API.">
        <Button
          variant="outline"
          icon={<RotateCcw className="size-4" />}
          onClick={() => {
            const { userName, localFonts, localModel, openaiKey, anthropicKey } = s;
            s.reset();
            s.patch({ userName, localFonts, localModel, openaiKey, anthropicKey });
            toast("Configuración restablecida", "success");
          }}
        >
          Restablecer
        </Button>
      </Field>
    </>
  );
}

const SHORTCUTS: [string, string][] = [
  ["Negrita / Cursiva / Subrayado", "Ctrl+B · Ctrl+I · Ctrl+U"],
  ["Tachado", "Ctrl+Shift+S"],
  ["Deshacer / Rehacer", "Ctrl+Z · Ctrl+Y"],
  ["Buscar / Reemplazar", "Ctrl+F · Ctrl+H"],
  ["Guardar", "Ctrl+S"],
  ["Imprimir / PDF", "Ctrl+P"],
  ["Aumentar / reducir tamaño", "Ctrl+] · Ctrl+["],
  ["Alinear izq. / centro / der. / justificar", "Ctrl+Shift+L · E · R · J"],
  ["Título 1, 2, 3", "Ctrl+Alt+1 · 2 · 3"],
  ["Lista con viñetas / numerada", "Ctrl+Shift+8 · Ctrl+Shift+7"],
  ["Lista de tareas", "Ctrl+Shift+9"],
  ["Cita", "Ctrl+Shift+B"],
  ["Salto de página", "Ctrl+Enter"],
  ["Abrir/cerrar panel de IA", "Ctrl+J"],
  ["Sangría", "Tab · Shift+Tab"],
  ["Salir del modo enfoque", "Esc"],
];

function Shortcuts() {
  return (
    <>
      <H>Atajos de teclado</H>
      <div className="rounded-[var(--radius)] border border-border">
        {SHORTCUTS.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between border-b border-border px-4 py-2.5 text-[13px] last:border-0">
            <span>{k}</span>
            <span className="flex gap-1">{v.split(" · ").map((x) => <Kbd key={x}>{x}</Kbd>)}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function About() {
  const s = useSettings();
  const { status, version: newVersion, error, check, install } = useUpdater();
  const [version, setVersion] = useState("");
  const desktop = isDesktop();
  useEffect(() => {
    void appVersion().then(setVersion);
  }, []);

  return (
    <>
      <div className="flex flex-col items-center pt-6 pb-6 text-center">
        <Logo className="mb-4 size-16" />
        <div className="text-[22px] font-bold">Lumen Office</div>
        <div className="mb-4 text-muted">Versión {version}</div>
        <p className="max-w-md text-[13.5px] text-muted">
          Suite ofimática con documentos, notas y asistente de IA. Hecha con React, Tiptap, WebLLM y Tauri.
        </p>
      </div>
      {desktop && (
        <>
          <Field
            label="Actualizaciones"
            desc={
              status === "checking"
                ? "Buscando…"
                : status === "uptodate"
                  ? "Tienes la última versión."
                  : status === "available"
                    ? `Hay una versión nueva: ${newVersion}.`
                    : status === "downloading" || status === "installing"
                      ? "Actualizando…"
                      : status === "error"
                        ? error
                        : "Las versiones nuevas se descargan desde GitHub y están firmadas."
            }
          >
            {status === "available" ? (
              <Button variant="primary" icon={<Download className="size-4" />} onClick={() => void install()}>
                Actualizar a {newVersion}
              </Button>
            ) : (
              <Button variant="outline" disabled={status === "checking" || status === "downloading" || status === "installing"} onClick={() => void check()}>
                Buscar actualizaciones
              </Button>
            )}
          </Field>
          <Field label="Buscar actualizaciones al abrir la app">
            <Switch checked={s.autoCheckUpdates} onChange={(v) => s.set("autoCheckUpdates", v)} label="Buscar actualizaciones al abrir la app" />
          </Field>
        </>
      )}
      <Field
        label="Licencia"
        desc="PolyForm Noncommercial 1.0.0: se puede usar, copiar y modificar gratis para fines no comerciales. No se permite venderla ni usarla para ganar dinero."
      >
        <span className="text-[12.5px] text-muted">© Alejandro Zapata</span>
      </Field>
      <Field label="Licencias de terceros" desc="Avisos de copyright y licencias de las librerías que incluye la app.">
        <ThirdPartyNotices />
      </Field>
    </>
  );
}

/** Muestra el archivo de avisos de terceros que se genera con «npm run notices». */
function ThirdPartyNotices() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const load = () => {
    setOpen(true);
    if (text === null)
      fetch("/third-party-notices.txt")
        .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
        .then(setText)
        .catch(() => setText("No se pudieron cargar los avisos."));
  };
  return (
    <>
      <Button variant="outline" onClick={load}>
        Ver licencias
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title="Licencias de terceros" className="w-[min(94vw,820px)]">
        <pre className="max-h-[60vh] overflow-auto rounded-[var(--radius)] bg-surface-2 p-4 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap text-text">
          {text ?? "Cargando…"}
        </pre>
      </Dialog>
    </>
  );
}
