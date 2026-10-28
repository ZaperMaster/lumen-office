import { useEffect } from "react";
import { preloadLocalAI } from "@/lib/localModels";
import { useSettings } from "@/store/settings";

/** Al mostrarse una parte de la IA, prepara el modelo local para que responda al momento. */
export function usePreloadAI() {
  const aiEngine = useSettings((s) => s.aiEngine);
  const localModel = useSettings((s) => s.localModel);
  useEffect(() => {
    void preloadLocalAI(aiEngine, localModel);
  }, [aiEngine, localModel]);
}
