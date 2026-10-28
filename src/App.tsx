import { lazy, Suspense, useEffect } from "react";
import { useApp } from "@/store/app";
import { useSettings } from "@/store/settings";
import { applyTheme } from "@/lib/themes";
import { TooltipProvider } from "@/components/ui";
import { Toasts } from "@/components/Toasts";
import { Launcher } from "@/components/launcher/Launcher";
import { UnsavedDialog } from "@/components/UnsavedDialog";
import { UpdateBanner } from "@/components/UpdateBanner";
import { WindowControls, WINDOW_CONTROLS_WIDTH } from "@/components/WindowControls";
import { installCloseGuard } from "@/lib/closeGuard";
import { isDesktop } from "@/lib/files";

// Espacio que las barras superiores dejan a los botones de la ventana (solo en la app de escritorio)
document.documentElement.style.setProperty("--wc", isDesktop() ? `${WINDOW_CONTROLS_WIDTH}px` : "0px");

const DocumentApp = lazy(() => import("@/components/editor/DocumentApp"));
const NotesApp = lazy(() => import("@/components/notes/NotesApp"));
const AssistantApp = lazy(() => import("@/components/ai/AssistantApp"));
const SheetApp = lazy(() => import("@/components/sheet/SheetApp"));
const SlidesApp = lazy(() => import("@/components/slides/SlidesApp"));
// Configuración solo se descarga al abrirla (aligera el arranque)
const SettingsDialog = lazy(() => import("@/components/SettingsDialog").then((m) => ({ default: m.SettingsDialog })));

function ThemeSync() {
  const { themeId, accent, paperMode, uiFont, radius } = useSettings();
  useEffect(() => {
    applyTheme({ themeId, accent, paperMode, uiFont, radius });
  }, [themeId, accent, paperMode, uiFont, radius]);
  return null;
}

/** Confirma antes de cerrar la ventana si hay cambios sin guardar en archivos. */
function CloseGuard() {
  useEffect(() => installCloseGuard(), []);
  useEffect(() => {
    const t = setTimeout(() => void import("@/lib/localModels").then((m) => m.removeRetiredModels()), 5000);
    return () => clearTimeout(t);
  }, []);
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
  const settingsOpen = useApp((s) => s.settingsOpen);

  return (
    <TooltipProvider>
      <ThemeSync />
      <Suspense fallback={<Loading />}>
        {route.name === "home" && <Launcher />}
        {route.name === "document" && <DocumentApp key={route.id} id={route.id} />}
        {route.name === "notes" && <NotesApp />}
        {route.name === "assistant" && <AssistantApp />}
        {route.name === "sheet" && <SheetApp key={route.id} id={route.id} />}
        {route.name === "slides" && <SlidesApp key={route.id} id={route.id} />}
      </Suspense>
      {settingsOpen && (
        <Suspense fallback={null}>
          <SettingsDialog />
        </Suspense>
      )}
      <Toasts />
      <UnsavedDialog />
      <UpdateBanner />
      <CloseGuard />
      <WindowControls />
    </TooltipProvider>
  );
}
