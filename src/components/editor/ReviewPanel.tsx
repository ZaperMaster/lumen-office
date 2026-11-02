import { useEffect, useReducer, useState } from "react";
import type { Editor } from "@tiptap/react";
import { Check, CheckCheck, MessageSquare, RotateCcw, Trash2, X, XCircle } from "lucide-react";
import type { DocComment } from "@/lib/db";
import { listChanges, type Change } from "@/components/editor/review";
import { relativeTime } from "@/lib/format";
import { Button, Switch, cn } from "@/components/ui";

import { L } from "@/lib/i18n";
/*
 * Panel de revisión: comentarios (con respuestas) y lista de cambios
 * propuestos para aceptarlos o rechazarlos uno a uno.
 */

/** Posiciones del texto marcado con cada comentario, en orden de aparición. */
export function commentRanges(editor: Editor): Map<string, { from: number; to: number }> {
  const out = new Map<string, { from: number; to: number }>();
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText) return true;
    for (const m of node.marks) {
      if (m.type.name !== "comment" || !m.attrs.id) continue;
      const r = out.get(m.attrs.id);
      if (r) r.to = pos + node.nodeSize;
      else out.set(m.attrs.id, { from: pos, to: pos + node.nodeSize });
    }
    return false;
  });
  return out;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";

export function ReviewPanel({
  editor,
  comments,
  track,
  author,
  focusId,
  onComments,
  onTrack,
  onClose,
}: {
  editor: Editor;
  comments: Record<string, DocComment>;
  track: boolean;
  author: string;
  /** Comentario recién creado (se abre para escribir) */
  focusId: string | null;
  onComments: (next: Record<string, DocComment>) => void;
  onTrack: (on: boolean) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"comments" | "changes">(focusId ? "comments" : "comments");
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  const [showResolved, setShowResolved] = useState(false);
  useEffect(() => {
    editor.on("update", rerender);
    editor.on("selectionUpdate", rerender);
    return () => {
      editor.off("update", rerender);
      editor.off("selectionUpdate", rerender);
    };
  }, [editor]);

  const ranges = commentRanges(editor);
  const list = [...ranges.entries()].map(([id, r]) => ({ c: comments[id], ...r })).filter((x) => !!x.c && (showResolved || !x.c.resolved));
  const changes = listChanges(editor.state.doc);
  const sel = editor.state.selection;
  const activeId = [...ranges.entries()].find(([, r]) => sel.from >= r.from && sel.from <= r.to)?.[0];

  const select = (from: number, to: number) => {
    editor.chain().focus().setTextSelection({ from, to }).scrollIntoView().run();
  };
  const update = (id: string, patch: Partial<DocComment>) => onComments({ ...comments, [id]: { ...comments[id], ...patch } });
  const remove = (id: string) => {
    const r = ranges.get(id);
    if (r) {
      // Se quita la marca de ese comentario en todo el documento
      const { tr } = editor.state;
      editor.state.doc.descendants((node, pos) => {
        if (node.isText && node.marks.some((m) => m.type.name === "comment" && m.attrs.id === id)) {
          const mark = node.marks.find((m) => m.type.name === "comment" && m.attrs.id === id)!;
          tr.removeMark(pos, pos + node.nodeSize, mark);
        }
      });
      editor.view.dispatch(tr);
    }
    const next = { ...comments };
    delete next[id];
    onComments(next);
  };

  return (
    <aside className="no-print flex h-full w-[340px] shrink-0 flex-col border-l border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span className="text-[14px] font-semibold">{L("Revisión")}</span>
        <button onClick={onClose} className="grid size-7 place-items-center rounded-md text-muted hover:bg-surface-2" aria-label={L("Cerrar panel")}><X className="size-4" /></button>
      </div>
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <label className="flex items-center gap-2 text-[12.5px] font-medium">
          <Switch checked={track} onChange={onTrack} label={L("Control de cambios")} />
          {L("Control de cambios")}
        </label>
        {track && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-700">{L("Activado")}</span>}
      </div>
      <div className="flex gap-1 border-b border-border px-3 py-2">
        {(["comments", "changes"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn("flex-1 rounded-md py-1.5 text-[12.5px] font-medium", tab === t ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2")}>
            {t === "comments" ? L("Comentarios ({0})", list.length) : L("Cambios ({0})", changes.length)}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === "comments" && (
          <>
            {!list.length && (
              <div className="py-10 text-center text-[12.5px] text-muted">
                <MessageSquare className="mx-auto mb-2 size-7 opacity-40" />
                {L("Selecciona un texto y pulsa «Nuevo comentario».")}
              </div>
            )}
            <div className="flex flex-col gap-2">
              {list.map(({ c, from, to }) => (
                <CommentCard
                  key={c.id}
                  c={c}
                  active={activeId === c.id}
                  autoEdit={focusId === c.id && !c.text}
                  author={author}
                  onSelect={() => select(from, to)}
                  onSave={(text) => update(c.id, { text })}
                  onReply={(text) => update(c.id, { replies: [...(c.replies ?? []), { author, date: Date.now(), text }] })}
                  onResolve={() => update(c.id, { resolved: !c.resolved })}
                  onDelete={() => remove(c.id)}
                />
              ))}
            </div>
            <label className="mt-3 flex items-center gap-2 text-[12px] text-muted">
              <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} /> {" "}{L("Ver también los resueltos")}
            </label>
          </>
        )}

        {tab === "changes" && (
          <>
            {changes.length > 0 && (
              <div className="mb-3 flex gap-2">
                <Button size="sm" variant="primary" icon={<CheckCheck className="size-3.5" />} onClick={() => editor.chain().focus().acceptAllChanges().run()}>{L("Aceptar todo")}</Button>
                <Button size="sm" variant="outline" icon={<XCircle className="size-3.5" />} onClick={() => editor.chain().focus().rejectAllChanges().run()}>{L("Rechazar todo")}</Button>
              </div>
            )}
            {!changes.length && (
              <div className="py-10 text-center text-[12.5px] text-muted">
                {track ? L("Escribe o borra en el documento: los cambios aparecerán aquí.") : L("Activa el control de cambios para ver aquí lo que se añade y se borra.")}
              </div>
            )}
            <div className="flex flex-col gap-2">
              {changes.map((ch: Change, i) => (
                <div key={`${ch.from}-${i}`} className="rounded-[var(--radius)] border border-border p-2.5">
                  <button onClick={() => select(ch.from, ch.to)} className="w-full text-left">
                    <div className="mb-1 flex items-center gap-2 text-[11.5px] text-muted">
                      <span className={cn("rounded px-1.5 py-0.5 font-semibold", ch.type === "insertion" ? "bg-emerald-500/15 text-emerald-700" : "bg-red-500/15 text-red-700")}>
                        {ch.type === "insertion" ? L("Añadido") : L("Eliminado")}
                      </span>
                      {ch.author} · {relativeTime(ch.date)}
                    </div>
                    <div className={cn("line-clamp-3 text-[13px]", ch.type === "deletion" && "text-red-700 line-through")}>{ch.text}</div>
                  </button>
                  <div className="mt-2 flex gap-1.5">
                    <Button size="sm" variant="ghost" icon={<Check className="size-3.5" />} onClick={() => editor.chain().focus().acceptChange(ch.from, ch.to, ch.type).run()}>{L("Aceptar")}</Button>
                    <Button size="sm" variant="ghost" icon={<X className="size-3.5" />} onClick={() => editor.chain().focus().rejectChange(ch.from, ch.to, ch.type).run()}>{L("Rechazar")}</Button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

function CommentCard({
  c,
  active,
  autoEdit,
  author,
  onSelect,
  onSave,
  onReply,
  onResolve,
  onDelete,
}: {
  c: DocComment;
  active: boolean;
  autoEdit: boolean;
  author: string;
  onSelect: () => void;
  onSave: (t: string) => void;
  onReply: (t: string) => void;
  onResolve: () => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(autoEdit);
  const [draft, setDraft] = useState(c.text);
  const [reply, setReply] = useState("");
  void author;
  return (
    <div
      onClick={onSelect}
      className={cn("cursor-pointer rounded-[var(--radius)] border p-3 transition-colors", active ? "border-amber-400 bg-amber-400/10" : "border-border hover:border-amber-400/60", c.resolved && "opacity-60")}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <span className="grid size-6 place-items-center rounded-full bg-accent text-[10.5px] font-bold text-accent-fg">{initials(c.author)}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-semibold">{c.author}</div>
          <div className="text-[11px] text-muted">{relativeTime(c.date)}{c.resolved ? L(" · Resuelto") : ""}</div>
        </div>
        <button onClick={(e) => { e.stopPropagation(); onResolve(); }} className="grid size-7 place-items-center rounded-md text-muted hover:bg-surface-2" title={c.resolved ? L("Reabrir") : L("Marcar como resuelto")}>
          {c.resolved ? <RotateCcw className="size-3.5" /> : <Check className="size-3.5" />}
        </button>
        <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="grid size-7 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-red-500" title={L("Eliminar comentario")}>
          <Trash2 className="size-3.5" />
        </button>
      </div>
      {editing ? (
        <div onClick={(e) => e.stopPropagation()}>
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter" && !e.shiftKey && draft.trim()) {
                e.preventDefault();
                onSave(draft.trim());
                setEditing(false);
              }
            }}
            rows={3}
            placeholder={L("Escribe tu comentario…")}
            className="w-full resize-none rounded-md border border-border bg-surface px-2 py-1.5 text-[13px] outline-none focus:border-accent"
          />
          <div className="mt-1.5 flex justify-end gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => { setDraft(c.text); setEditing(false); if (!c.text) onDelete(); }}>{L("Cancelar")}</Button>
            <Button size="sm" variant="primary" disabled={!draft.trim()} onClick={() => { onSave(draft.trim()); setEditing(false); }}>{L("Comentar")}</Button>
          </div>
        </div>
      ) : (
        <p onDoubleClick={() => setEditing(true)} className="text-[13px] whitespace-pre-wrap">{c.text}</p>
      )}
      {(c.replies ?? []).map((r, i) => (
        <div key={i} className="mt-2 border-l-2 border-border pl-2.5">
          <div className="text-[11.5px] font-semibold">{r.author} <span className="font-normal text-muted">· {relativeTime(r.date)}</span></div>
          <p className="text-[12.5px] whitespace-pre-wrap">{r.text}</p>
        </div>
      ))}
      {active && !editing && !c.resolved && (
        <input
          onClick={(e) => e.stopPropagation()}
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter" && reply.trim()) {
              onReply(reply.trim());
              setReply("");
            }
          }}
          placeholder={L("Responder… (Intro)")}
          className="mt-2 h-8 w-full rounded-md border border-border bg-surface px-2 text-[12.5px] outline-none focus:border-accent"
        />
      )}
    </div>
  );
}
