import { usePreloadAI } from "@/components/ai/usePreloadAI";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { ArrowUp, Copy, FilePlus2, Plus, Sparkles, Square, Trash2, X, CornerDownLeft } from "lucide-react";
import { streamText, currentModelName, contextLimit, type ChatMsg } from "@/lib/ai";
import { LocalAIBanner } from "@/components/ai/LocalAIStatus";
import { htmlToMarkdown, markdownToHtml } from "@/lib/io";
import { insertMarkdown } from "@/components/ai/aiStore";
import { useApp } from "@/store/app";
import { useSettings } from "@/store/settings";
import { Button, Switch, Tooltip, cn } from "@/components/ui";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  error?: boolean;
}

const DOC_SUGGESTIONS = [
  "Resume este documento en 5 puntos",
  "Sugiere un título atractivo",
  "Revisa errores y propone mejoras",
  "Crea un esquema para continuar",
];

const FREE_SUGGESTIONS = [
  "Escribe un correo para pedir un presupuesto",
  "Dame ideas para un artículo sobre productividad",
  "Redacta una carta de presentación para un empleo",
  "Explícame cómo estructurar un informe",
];

const STORAGE_KEY = "lumen.chat";

function loadHistory(key: string | null): ChatMessage[] {
  if (!key) return [];
  try {
    return JSON.parse(localStorage.getItem(`${STORAGE_KEY}.${key}`) ?? "[]");
  } catch {
    return [];
  }
}

export function ChatPanel({
  editor,
  docTitle,
  variant = "panel",
  onClose,
  onCreateDocument,
  storageKey = null,
}: {
  editor?: Editor | null;
  docTitle?: string;
  variant?: "panel" | "full";
  onClose?: () => void;
  onCreateDocument?: (markdown: string) => void;
  /** Si se indica, la conversación se recuerda en este equipo */
  storageKey?: string | null;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadHistory(storageKey));
  const [input, setInput] = useState("");
  const [useDoc, setUseDoc] = useState(true);
  const [controller, setController] = useState<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const toast = useApp((s) => s.toast);
  // Se suscribe al motor/modelo para refrescar el nombre mostrado
  useSettings((s) => `${s.aiEngine}|${s.localModel}|${s.ollamaModel}`);
  usePreloadAI();
  const busy = controller !== null;

  useEffect(() => {
    if (!storageKey) return;
    try {
      localStorage.setItem(`${STORAGE_KEY}.${storageKey}`, JSON.stringify(messages.slice(-60)));
    } catch {
      /* almacenamiento no disponible */
    }
  }, [messages, storageKey]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || busy) return;
    setInput("");
    const history: ChatMessage[] = [...messages.filter((m) => !m.error), { role: "user", content }];
    setMessages([...history, { role: "assistant", content: "" }]);

    let system: string | undefined;
    if (editor && useDoc) {
      let md = htmlToMarkdown(editor.getHTML());
      // Los modelos locales tienen un contexto limitado: se recorta el documento si es muy largo
      const limit = contextLimit();
      if (md.length > limit) md = md.slice(0, limit) + "\n\n[…documento recortado…]";
      system = `El usuario está trabajando en el documento «${docTitle || "Sin título"}». Su contenido actual en Markdown es:\n<documento>\n${md}\n</documento>\nUsa este documento como contexto cuando sea relevante.`;
    }

    const ctrl = new AbortController();
    setController(ctrl);
    try {
      const apiMessages: ChatMsg[] = history.map((m) => ({ role: m.role, content: m.content }));
      await streamText({
        messages: apiMessages,
        system,
        signal: ctrl.signal,
        onText: (_d, full) =>
          setMessages((prev) => {
            const next = [...prev];
            next[next.length - 1] = { role: "assistant", content: full };
            return next;
          }),
      });
    } catch (e) {
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { role: "assistant", content: e instanceof Error ? e.message : String(e), error: true };
        return next;
      });
    } finally {
      setController(null);
      inputRef.current?.focus();
    }
  };

  const suggestions = editor ? DOC_SUGGESTIONS : FREE_SUGGESTIONS;
  const modelName = currentModelName();

  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-surface", variant === "panel" && "border-l border-border")}>
      {variant === "panel" && (
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
          <span className="grid size-6 place-items-center rounded-md bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white">
            <Sparkles className="size-3.5" />
          </span>
          <span className="text-[13.5px] font-semibold">Asistente IA</span>
          <div className="ml-auto flex items-center gap-0.5">
            <Tooltip label="Nueva conversación">
              <button onClick={() => setMessages([])} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-text" aria-label="Nueva conversación">
                <Plus className="size-4" />
              </button>
            </Tooltip>
            {onClose && (
              <button onClick={onClose} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-text" aria-label="Cerrar panel">
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>
      )}

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className={cn("flex flex-col gap-4 p-4", variant === "full" && "mx-auto max-w-[760px] py-8")}>
          <LocalAIBanner />
          {messages.length === 0 && (
            <div className={cn("flex flex-col items-center text-center", variant === "full" ? "pt-16" : "pt-6")}>
              <div className="mb-3 grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-lg">
                <Sparkles className="size-6" />
              </div>
              <h3 className={cn("font-semibold", variant === "full" ? "text-[22px]" : "text-[15px]")}>¿En qué te ayudo?</h3>
              <p className="mt-1 mb-5 text-[13px] text-muted">
                {editor ? "Pregunta sobre tu documento o pide que escriba algo nuevo." : "Escribe, resume, traduce o genera ideas."}
              </p>
              <div className={cn("grid w-full gap-2", variant === "full" ? "grid-cols-2" : "grid-cols-1")}>
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-[var(--radius)] border border-border bg-surface px-3 py-2.5 text-left text-[13px] hover:border-accent/50 hover:bg-surface-2"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <Message
              key={i}
              msg={m}
              streaming={busy && i === messages.length - 1}
              onInsert={editor ? () => { insertMarkdown(editor, m.content); toast("Insertado en el documento", "success"); } : undefined}
              onCreateDocument={onCreateDocument ? () => onCreateDocument(m.content) : undefined}
            />
          ))}
        </div>
      </div>

      <div className={cn("shrink-0 border-t border-border p-3", variant === "full" && "mx-auto w-full max-w-[760px] border-0 pb-6")}>
        <div className="rounded-[calc(var(--radius)+4px)] border border-border bg-surface focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-soft">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={variant === "full" ? 3 : 2}
            placeholder="Escribe un mensaje…"
            className="block w-full resize-none bg-transparent px-3 pt-2.5 text-[13.5px] outline-none placeholder:text-muted"
          />
          <div className="flex items-center gap-2 px-2 pb-2">
            {editor && (
              <label className="flex items-center gap-1.5 text-[11.5px] text-muted">
                <Switch checked={useDoc} onChange={setUseDoc} label="Usar el documento como contexto" />
                Usar documento
              </label>
            )}
            <span className="truncate text-[11px] text-muted">{modelName}</span>
            <div className="ml-auto">
              {busy ? (
                <button onClick={() => controller?.abort()} className="grid size-8 place-items-center rounded-full bg-text text-bg" aria-label="Detener">
                  <Square className="size-3" />
                </button>
              ) : (
                <button
                  onClick={() => send(input)}
                  disabled={!input.trim()}
                  className="grid size-8 place-items-center rounded-full bg-accent text-accent-fg disabled:opacity-40"
                  aria-label="Enviar"
                >
                  <ArrowUp className="size-4" />
                </button>
              )}
            </div>
          </div>
        </div>
        {variant === "full" && messages.length > 0 && (
          <div className="mt-2 flex justify-center">
            <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => setMessages([])}>
              Borrar conversación
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function Message({
  msg,
  streaming,
  onInsert,
  onCreateDocument,
}: {
  msg: ChatMessage;
  streaming: boolean;
  onInsert?: () => void;
  onCreateDocument?: () => void;
}) {
  const html = useMemo(() => (msg.role === "assistant" && !msg.error ? markdownToHtml(msg.content) : ""), [msg]);
  const toast = useApp((s) => s.toast);

  if (msg.role === "user") {
    return (
      <div className="ml-8 self-end rounded-[calc(var(--radius)+4px)] rounded-br-md bg-accent px-3.5 py-2 text-[13.5px] whitespace-pre-wrap text-accent-fg">
        {msg.content}
      </div>
    );
  }
  if (msg.error) {
    return <div className="rounded-[var(--radius)] border border-red-500/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-500">{msg.content}</div>;
  }
  return (
    <div className="group">
      {msg.content ? (
        <div className={cn("lumen-editor text-[13.5px] leading-relaxed", streaming && "ai-streaming")} style={{ color: "var(--text)", whiteSpace: "normal" }} dangerouslySetInnerHTML={{ __html: html }} />
      ) : streaming ? (
        <div className="py-1">
          <div className="flex gap-1 py-1">
            {[0, 1, 2].map((i) => (
              <span key={i} className="size-1.5 animate-bounce rounded-full bg-muted" style={{ animationDelay: `${i * 120}ms` }} />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex gap-1 py-2">
          {[0, 1, 2].map((i) => (
            <span key={i} className="size-1.5 animate-bounce rounded-full bg-muted" style={{ animationDelay: `${i * 120}ms` }} />
          ))}
        </div>
      )}
      {!streaming && msg.content && (
        <div className="mt-1.5 flex gap-1 opacity-70 transition-opacity group-hover:opacity-100">
          {onInsert && (
            <Button size="sm" variant="ghost" icon={<CornerDownLeft className="size-3.5" />} onClick={onInsert}>
              Insertar
            </Button>
          )}
          {onCreateDocument && (
            <Button size="sm" variant="ghost" icon={<FilePlus2 className="size-3.5" />} onClick={onCreateDocument}>
              Crear documento
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            icon={<Copy className="size-3.5" />}
            onClick={async () => {
              await navigator.clipboard.writeText(msg.content);
              toast("Copiado", "success");
            }}
          >
            Copiar
          </Button>
        </div>
      )}
    </div>
  );
}
