import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "@/lib/fonts";
import "./index.css";
import App from "./App";

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
      <App />
    )}
  </StrictMode>,
);
