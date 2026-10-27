// Hilo en segundo plano que ejecuta el modelo de lenguaje local (WebGPU)
// para que la interfaz no se congele mientras genera texto.
import { WebWorkerMLCEngineHandler } from "@mlc-ai/web-llm";

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (msg: MessageEvent) => handler.onmessage(msg);
