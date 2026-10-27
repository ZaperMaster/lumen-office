import { lazy, Suspense, useEffect } from "react";
import { useApp } from "@/store/app";
import { useSettings } from "@/store/settings";
import { applyTheme } from "@/lib/themes";
import { TooltipProvider } from "@/components/ui";
import { Toasts } from "@/components/Toasts";
import { Launcher } from "@/components/launcher/Launcher";
import { SettingsDialog } from "@/components/SettingsDialog";

const DocumentApp = lazy(() => import("@/components/editor/DocumentApp"));
const NotesApp = lazy(() => import("@/components/notes/NotesApp"));
const AssistantApp = lazy(() => import("@/components/ai/AssistantApp"));

function ThemeSync() {
  const { themeId, accent, paperMode, uiFont, radius } = useSettings();
  useEffect(() => {
    applyTheme({ themeId, accent, paperMode, uiFont, radius });
  }, [themeId, accent, paperMode, uiFont, radius]);
  return null;
}

function Loading() {
  return (
    <div className="grid h-full place-items-center text-muted">
      <div className="size-6 animate-spin rounded-full border-2 border-border border-t-accent" />
    </div>
  );
}

export default function App() {
  const route = useApp((s) => s.route);

  return (
    <TooltipProvider>
      <ThemeSync />
      <Suspense fallback={<Loading />}>
        {route.name === "home" && <Launcher />}
        {route.name === "document" && <DocumentApp key={route.id} id={route.id} />}
        {route.name === "notes" && <NotesApp />}
        {route.name === "assistant" && <AssistantApp />}
      </Suspense>
      <SettingsDialog />
      <Toasts />
    </TooltipProvider>
  );
}
