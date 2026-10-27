/*
 * Operaciones sobre imágenes con <canvas>: recortar y girar.
 * Devuelven una nueva imagen en data URL, así el documento sigue siendo autónomo.
 */

export interface CropRect {
  /** Fracciones 0..1 respecto al tamaño de la imagen */
  x: number;
  y: number;
  w: number;
  h: number;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Necesario para poder leer los píxeles de imágenes de internet
    if (!src.startsWith("data:")) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo cargar la imagen."));
    img.src = src;
  });
}

function outputType(src: string): string {
  return /^data:image\/(png|gif|webp|svg)/.test(src) ? "image/png" : "image/jpeg";
}

function toDataUrl(canvas: HTMLCanvasElement, type: string): string {
  try {
    return canvas.toDataURL(type, 0.92);
  } catch {
    throw new Error("Esta imagen viene de una web que no permite editarla. Descárgala e insértala desde tu equipo.");
  }
}

export async function cropImage(src: string, rect: CropRect): Promise<{ src: string; width: number; height: number }> {
  const img = await loadImage(src);
  const sx = Math.round(rect.x * img.naturalWidth);
  const sy = Math.round(rect.y * img.naturalHeight);
  const sw = Math.max(1, Math.round(rect.w * img.naturalWidth));
  const sh = Math.max(1, Math.round(rect.h * img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  canvas.getContext("2d")!.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  return { src: toDataUrl(canvas, outputType(src)), width: sw, height: sh };
}

export async function rotateImage(src: string, direction: 1 | -1): Promise<{ src: string; width: number; height: number }> {
  const img = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalHeight;
  canvas.height = img.naturalWidth;
  const ctx = canvas.getContext("2d")!;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((direction * Math.PI) / 2);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  return { src: toDataUrl(canvas, outputType(src)), width: canvas.width, height: canvas.height };
}

export async function flipImage(src: string): Promise<string> {
  const img = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(img, 0, 0);
  return toDataUrl(canvas, outputType(src));
}
