import { useState } from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { Check, Copy, ExternalLink, Pencil, Unlink } from "lucide-react";
import { normalizeUrl, openExternal } from "@/lib/openExternal";
import { useApp } from "@/store/app";
import { Tooltip, cn } from "@/components/ui";

/** Menú que aparece al poner el cursor sobre un vínculo: abrir, editar, copiar y quitar. */
export function LinkBubble({ editor }: { editor: Editor }) {
  const toast = useApp((s) => s.toast);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const href = useEditorState({ editor, selector: ({ editor: e }) => (e.getAttributes("link").href as string | undefined) ?? "" });

  const open = () => openExternal(href).catch((e) => toast(e instanceof Error ? e.message : "No se pudo abrir", "error"));
  const save = () => {
    const url = normalizeUrl(draft);
    if (url) editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    else editor.chain().focus().extendMarkRange("link").unsetLink().run();
    setEditing(false);
  };

  const btn = (label: string, onClick: () => void, icon: React.ReactNode, danger?: boolean) => (
    <Tooltip label={label}>
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClick}
        aria-label={label}
        className={cn("grid size-7 place-items-center rounded-md hover:bg-surface-2", danger && "text-red-500")}
      >
        {icon}
      </button>
    </Tooltip>
  );

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="linkBubble"
      options={{ placement: "bottom-start", offset: 6 }}
      shouldShow={({ editor: e, state }) => e.isEditable && state.selection.empty && e.isActive("link")}
      className="no-print z-40"
    >
      <div className="flex max-w-[420px] items-center gap-1 rounded-[var(--radius)] border border-border bg-surface p-1 text-[13px] shadow-soft">
        {editing ? (
          <>
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") setEditing(false);
              }}
              className="h-7 w-[280px] rounded-md border border-border bg-surface px-2 outline-none focus:border-accent"
              placeholder="https://…"
            />
            {btn("Guardar", save, <Check className="size-4 text-accent" />)}
          </>
        ) : (
          <>
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={open}
              className="max-w-[260px] truncate rounded-md px-2 py-1 text-left text-accent underline-offset-2 hover:underline"
              title="Abrir vínculo (también con Ctrl + clic)"
            >
              {href}
            </button>
            <span className="mx-0.5 h-5 w-px bg-border" />
            {btn("Abrir en el navegador", open, <ExternalLink className="size-4" />)}
            {btn("Editar vínculo", () => { setDraft(href); setEditing(true); }, <Pencil className="size-4" />)}
            {btn(
              "Copiar dirección",
              async () => {
                await navigator.clipboard.writeText(href);
                toast("Dirección copiada", "success");
              },
              <Copy className="size-4" />,
            )}
            {btn("Quitar vínculo", () => editor.chain().focus().extendMarkRange("link").unsetLink().run(), <Unlink className="size-4" />, true)}
          </>
        )}
      </div>
    </BubbleMenu>
  );
}
