import type { Editor } from "@tiptap/react";
import { countWords } from "@/lib/db";
import { Button, Dialog } from "@/components/ui";

import { L, uiLocale } from "@/lib/i18n";
export function WordCountDialog({ editor, open, onOpenChange, pages }: { editor: Editor; open: boolean; onOpenChange: (o: boolean) => void; pages: number }) {
  if (!open) return null;
  const text = editor.getText({ blockSeparator: "\n" });
  const words = countWords(text);
  const paragraphs = text.split("\n").filter((l) => l.trim()).length;
  const sentences = (text.match(/[^.!?…]+[.!?…]+/g) ?? []).length;
  const rows: [string, string | number][] = [
    [L("Páginas"), pages],
    [L("Palabras"), words.toLocaleString(uiLocale())],
    [L("Caracteres (sin espacios)"), text.replace(/\s/g, "").length.toLocaleString(uiLocale())],
    [L("Caracteres (con espacios)"), text.replace(/\n/g, "").length.toLocaleString(uiLocale())],
    [L("Párrafos"), paragraphs],
    [L("Oraciones"), sentences],
    [L("Tiempo de lectura"), `${Math.max(1, Math.round(words / 220))} min`],
    [L("Tiempo para leer en voz alta"), `${Math.max(1, Math.round(words / 130))} min`],
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={L("Contar palabras")} footer={<Button variant="primary" onClick={() => onOpenChange(false)}>{L("Cerrar")}</Button>}>
      <table className="w-full text-[13.5px]">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} className="border-b border-border last:border-0">
              <td className="py-2 text-muted">{k}</td>
              <td className="py-2 text-right font-semibold tabular-nums">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Dialog>
  );
}
