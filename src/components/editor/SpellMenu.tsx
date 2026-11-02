import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import { BookPlus, EyeOff, Loader2 } from "lucide-react";
import { spellKey } from "@/components/editor/spellcheck";
import { addToDictionary, ignoreWord, suggestions } from "@/lib/spell";

/** Menú con sugerencias al hacer clic derecho en una palabra subrayada en rojo. */
export function SpellMenu({ editor }: { editor: Editor }) {
  const [menu, setMenu] = useState<null | { x: number; y: number; from: number; to: number; word: string; list: string[] | null }>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dom = editor.view.dom;
    const onContext = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest?.(".spell-error")) return;
      const hit = editor.view.posAtCoords({ left: e.clientX, top: e.clientY });
      const set = spellKey.getState(editor.state);
      const deco = hit && set?.find(hit.pos - 1, hit.pos + 1)[0];
      if (!deco) return;
      e.preventDefault();
      const word = (deco.spec as { word: string }).word;
      setMenu({ x: e.clientX, y: e.clientY, from: deco.from, to: deco.to, word, list: null });
      void suggestions(word).then((list) => setMenu((m) => (m && m.word === word ? { ...m, list } : m)));
    };
    dom.addEventListener("contextmenu", onContext);
    return () => dom.removeEventListener("contextmenu", onContext);
  }, [editor]);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setMenu(null);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [menu]);

  if (!menu) return null;
  const replace = (s: string) => {
    editor.chain().focus().insertContentAt({ from: menu.from, to: menu.to }, s).run();
    setMenu(null);
  };
  const item = "flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] hover:bg-surface-2";
  return createPortal(
    <div
      ref={ref}
      className="fixed z-[95] min-w-[210px] animate-pop-in rounded-[var(--radius)] border border-border bg-surface p-1 text-text shadow-soft"
      style={{ left: Math.min(menu.x, window.innerWidth - 230), top: Math.min(menu.y, window.innerHeight - 260) }}
    >
      {menu.list === null ? (
        <div className="flex items-center gap-2 px-2.5 py-2 text-[12.5px] text-muted">
          <Loader2 className="size-3.5 animate-spin" /> Buscando sugerencias…
        </div>
      ) : menu.list.length ? (
        menu.list.map((s) => (
          <button key={s} onClick={() => replace(s)} className={`${item} font-semibold`}>
            {s}
          </button>
        ))
      ) : (
        <div className="px-2.5 py-2 text-[12.5px] text-muted">Sin sugerencias</div>
      )}
      <div className="my-1 h-px bg-border" />
      <button
        onClick={() => {
          void addToDictionary(menu.word);
          setMenu(null);
        }}
        className={item}
      >
        <BookPlus className="size-4 text-muted" /> Añadir «{menu.word}» al diccionario
      </button>
      <button
        onClick={() => {
          ignoreWord(menu.word);
          setMenu(null);
        }}
        className={item}
      >
        <EyeOff className="size-4 text-muted" /> Ignorar
      </button>
    </div>,
    document.body,
  );
}
