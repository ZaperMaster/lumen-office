import type { ReactNode } from "react";
import type { Editor } from "@tiptap/react";
import {
  AlignLeft, BookOpen, Languages, ListChecks, Minimize2, Maximize2, PenLine, SpellCheck, Table2, Wand2, MessageSquareText, Feather,
} from "lucide-react";
import { AI_ACTIONS, LANGUAGES, TONES } from "@/lib/ai";
import { useAI } from "@/components/ai/aiStore";
import { MenuContent, MenuItem, MenuLabel, MenuSeparator, SubMenu } from "@/components/ui";

const ICONS: Record<string, ReactNode> = {
  improve: <Wand2 />,
  fix: <SpellCheck />,
  shorter: <Minimize2 />,
  longer: <Maximize2 />,
  simplify: <Feather />,
  bullets: <ListChecks />,
  table: <Table2 />,
  summarize: <AlignLeft />,
  continue: <PenLine />,
  explain: <BookOpen />,
};

/** Contenido del menú de acciones de IA (se usa en la cinta y en el menú flotante). */
export function AIActionsMenuContent({ editor, align = "start" }: { editor: Editor; align?: "start" | "end" | "center" }) {
  const run = useAI((s) => s.run);
  const setPanelOpen = useAI((s) => s.setPanelOpen);
  const item = (id: string) => {
    const a = AI_ACTIONS.find((x) => x.id === id)!;
    return (
      <MenuItem key={id} icon={ICONS[id]} onSelect={() => run(editor, id)}>
        {a.label}
      </MenuItem>
    );
  };
  return (
    <MenuContent align={align} className="w-[240px]">
      <MenuLabel>Editar</MenuLabel>
      {["improve", "fix", "shorter", "longer", "simplify"].map(item)}
      <MenuSeparator />
      <MenuLabel>Transformar</MenuLabel>
      <SubMenu label="Cambiar tono" icon={<MessageSquareText />}>
        {TONES.map((t) => (
          <MenuItem key={t} onSelect={() => run(editor, "tone", t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </MenuItem>
        ))}
      </SubMenu>
      <SubMenu label="Traducir" icon={<Languages />}>
        {LANGUAGES.map((l) => (
          <MenuItem key={l} onSelect={() => run(editor, "translate", l)}>
            {l[0].toUpperCase() + l.slice(1)}
          </MenuItem>
        ))}
      </SubMenu>
      {["bullets", "table"].map(item)}
      <MenuSeparator />
      <MenuLabel>Generar</MenuLabel>
      {["summarize", "continue", "explain"].map(item)}
      <MenuSeparator />
      <MenuItem icon={<MessageSquareText />} onSelect={() => setPanelOpen(true)}>
        Abrir chat con la IA
      </MenuItem>
    </MenuContent>
  );
}
