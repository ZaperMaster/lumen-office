import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { Bold, Code, Highlighter, Italic, Sparkles, Strikethrough, Underline } from "lucide-react";
import { useEditorFlags } from "@/components/editor/controls";
import { LinkButton } from "@/components/editor/Ribbon";
import { AIActionsMenuContent } from "@/components/ai/AIActionsMenu";
import { Menu, MenuTrigger, cn } from "@/components/ui";

/** Barra flotante que aparece al seleccionar texto. */
export function SelectionBubble({ editor }: { editor: Editor }) {
  const f = useEditorFlags(editor);
  const btn = (active: boolean, onClick: () => void, icon: React.ReactNode, label: string) => (
    <button
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn("grid h-7 w-7 place-items-center rounded-md", active ? "bg-accent-soft text-accent" : "hover:bg-surface-2")}
    >
      {icon}
    </button>
  );
  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: "top", offset: 8 }}
      shouldShow={({ editor: e, state }) => {
        const { empty } = state.selection;
        if (empty || !e.isEditable) return false;
        if (e.isActive("image") || e.isActive("codeBlock") || e.isActive("pageBreak")) return false;
        return state.doc.textBetween(state.selection.from, state.selection.to).trim().length > 0;
      }}
      className="no-print z-40"
    >
      <div className="flex items-center gap-0.5 rounded-[var(--radius)] border border-border bg-surface p-1 shadow-soft">
        <Menu>
          <MenuTrigger asChild>
            <button
              onMouseDown={(e) => e.preventDefault()}
              className="flex h-7 items-center gap-1.5 rounded-md bg-gradient-to-r from-violet-500 to-fuchsia-500 px-2.5 text-[12.5px] font-medium text-white hover:brightness-110"
            >
              <Sparkles className="size-3.5" />
              IA
            </button>
          </MenuTrigger>
          <AIActionsMenuContent editor={editor} />
        </Menu>
        <span className="mx-0.5 h-5 w-px bg-border" />
        {btn(f.bold, () => editor.chain().focus().toggleBold().run(), <Bold className="size-4" />, "Negrita")}
        {btn(f.italic, () => editor.chain().focus().toggleItalic().run(), <Italic className="size-4" />, "Cursiva")}
        {btn(f.underline, () => editor.chain().focus().toggleUnderline().run(), <Underline className="size-4" />, "Subrayado")}
        {btn(f.strike, () => editor.chain().focus().toggleStrike().run(), <Strikethrough className="size-4" />, "Tachado")}
        {btn(f.code, () => editor.chain().focus().toggleCode().run(), <Code className="size-4" />, "Código")}
        {btn(f.highlight, () => editor.chain().focus().toggleHighlight({ color: "#fff59d" }).run(), <Highlighter className="size-4" />, "Resaltar")}
        <LinkButton editor={editor} />
      </div>
    </BubbleMenu>
  );
}
