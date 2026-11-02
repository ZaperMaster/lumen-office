import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "@/lib/fonts";
import "./index.css";
import { initLanguage } from "@/lib/i18n";

// El idioma se carga antes que el resto de la app: algunas listas (temas,
// animaciones…) se traducen al cargar sus módulos.
initLanguage();
const App = lazy(() => import("./App"));

// La ventana del público de la vista del moderador solo muestra las diapositivas
const audience = /^#audience=(.+)$/.exec(location.hash)?.[1];
const AudienceWindow = lazy(() => import("@/components/slides/PresenterView").then((m) => ({ default: m.AudienceWindow })));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {audience ? (
      <Suspense fallback={<div className="fixed inset-0 bg-black" />}>
        <AudienceWindow docId={decodeURIComponent(audience)} />
      </Suspense>
    ) : (
      <Suspense fallback={null}>
        <App />
      </Suspense>
    )}
  </StrictMode>,
);
