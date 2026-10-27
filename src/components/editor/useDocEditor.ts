import { useEffect, useMemo, useRef, useState } from "react";
import { useEditor, type JSONContent } from "@tiptap/react";
import { buildExtensions } from "@/components/editor/extensions";
import { countWords, plainText, updateDoc } from "@/lib/db";
import { debounce } from "@/lib/format";
import { useSettings } from "@/store/settings";
import type { SaveState } from "@/components/editor/StatusBar";

/**
 * Crea el editor para un documento y lo guarda automáticamente
 * en la base de datos local mientras se escribe.
 */
export function useDocEditor(docId: string, initial: JSONContent, placeholder: string) {
  const { spellcheck, smartTyping } = useSettings();
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const latest = useRef<JSONContent>(initial);
  const dirty = useRef(false);

  const save = useMemo(
    () =>
      debounce(async (json: JSONContent) => {
        setSaveState("saving");
        dirty.current = false;
        const text = plainText(json);
        await updateDoc(docId, { content: json, text, words: countWords(text) });
        if (!dirty.current) setSaveState("saved");
      }, 600),
    [docId],
  );

  const editor = useEditor(
    {
      extensions: buildExtensions({ placeholder, smartTyping }),
      content: latest.current,
      editorProps: {
        attributes: { class: "lumen-editor", spellcheck: String(spellcheck) },
        handleDrop: (view, event) => {
          // Soltar imágenes desde el explorador de archivos
          const files = [...(event.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith("image/"));
          if (!files.length) return false;
          event.preventDefault();
          const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? view.state.selection.from;
          files.forEach((f) => {
            const r = new FileReader();
            r.onload = () => {
              const node = view.state.schema.nodes.image.create({ src: r.result, alt: f.name });
              view.dispatch(view.state.tr.insert(pos, node));
            };
            r.readAsDataURL(f);
          });
          return true;
        },
        handlePaste: (view, event) => {
          const files = [...(event.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
          if (!files.length) return false;
          files.forEach((f) => {
            const r = new FileReader();
            r.onload = () => {
              const node = view.state.schema.nodes.image.create({ src: r.result, alt: f.name });
              view.dispatch(view.state.tr.replaceSelectionWith(node));
            };
            r.readAsDataURL(f);
          });
          return true;
        },
      },
      onUpdate: ({ editor: e }) => {
        latest.current = e.getJSON();
        dirty.current = true;
        setSaveState("dirty");
        save(latest.current);
      },
    },
    // El autoformato cambia la lista de extensiones: se recrea el editor conservando el contenido
    [smartTyping],
  );

  useEffect(() => {
    editor?.view.dom.setAttribute("spellcheck", String(spellcheck));
  }, [editor, spellcheck]);

  // Guarda lo pendiente al salir
  useEffect(() => {
    const flush = () => {
      if (dirty.current) save.flush(latest.current);
    };
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, [save]);

  useEffect(
    () => () => {
      save.cancel();
      if (!dirty.current) return;
      const text = plainText(latest.current);
      void updateDoc(docId, { content: latest.current, text, words: countWords(text) });
    },
    [docId, save],
  );

  return { editor, saveState, saveNow: () => save.flush(latest.current) };
}
