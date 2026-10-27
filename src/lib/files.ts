import type { JSONContent } from "@tiptap/core";
import { saveAs } from "file-saver";
import { updateDoc, type DocRecord, type FileFormat } from "@/lib/db";
import { buildDocx, buildHtmlPage, buildLumen, buildMarkdown, importFromFile, safeFileName } from "@/lib/io";
import { useApp } from "@/store/app";

/*
 * Archivos en el disco, como en Word:
 *  - Guardar: si el documento ya tiene archivo, lo reemplaza; si no, pregunta dónde guardarlo.
 *  - Guardar como: siempre pregunta, y el documento pasa a estar vinculado al archivo nuevo.
 *  - Exportar: guarda una copia en otro formato, sin cambiar el archivo vinculado.
 * En la app de escritorio se usa el diálogo de Windows; en el navegador, una descarga.
 */

export const FORMATS: Record<FileFormat, { label: string; ext: string; mime: string }> = {
  docx: { label: "Documento de Word", ext: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  lumen: { label: "Documento de Lumen (sin pérdidas)", ext: "lumen", mime: "application/json" },
  md: { label: "Markdown", ext: "md", mime: "text/markdown;charset=utf-8" },
  html: { label: "Página web", ext: "html", mime: "text/html;charset=utf-8" },
  txt: { label: "Texto sin formato", ext: "txt", mime: "text/plain;charset=utf-8" },
};

/** Formatos para «Guardar» y «Guardar como», en orden de preferencia. */
const SAVE_ORDER: FileFormat[] = ["docx", "lumen", "md", "html", "txt"];

export function isDesktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function formatFromPath(path: string): FileFormat | null {
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "markdown") return "md";
  if (ext === "htm") return "html";
  return ext && ext in FORMATS ? (ext as FileFormat) : null;
}

export function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/** Contenido que se va a guardar, a partir del editor. */
export interface DocSource {
  json: JSONContent;
  html: string;
  text: string;
  title: string;
}

async function buildBytes(format: FileFormat, src: DocSource): Promise<Uint8Array> {
  if (format === "docx") return new Uint8Array(await (await buildDocx(src.json, src.title)).arrayBuffer());
  const text =
    format === "lumen"
      ? buildLumen(src.json, src.title)
      : format === "md"
        ? buildMarkdown(src.html, src.title)
        : format === "html"
          ? buildHtmlPage(src.html, src.title)
          : src.text;
  return new TextEncoder().encode(text);
}

/* ------------------------------------------------------------------ */
/*  Diálogos y escritura                                               */
/* ------------------------------------------------------------------ */

async function chooseSavePath(title: string, formats: FileFormat[], currentPath?: string | null): Promise<string | null> {
  const { save } = await import("@tauri-apps/plugin-dialog");
  const base = currentPath ? currentPath.replace(/\.[^.\\/]+$/, "") : safeFileName(title);
  const path = await save({
    title: "Guardar documento",
    defaultPath: `${base}.${FORMATS[formats[0]].ext}`,
    filters: formats.map((f) => ({ name: FORMATS[f].label, extensions: [FORMATS[f].ext] })),
  });
  if (!path) return null;
  // Si el usuario no escribe extensión, se añade la del primer formato
  return formatFromPath(path) ? path : `${path}.${FORMATS[formats[0]].ext}`;
}

async function writeFile(path: string, bytes: Uint8Array) {
  const fs = await import("@tauri-apps/plugin-fs");
  await fs.writeFile(path, bytes);
}

export async function revealInFolder(path: string) {
  const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
  await revealItemInDir(path);
}

function savedToast(message: string, path: string) {
  useApp.getState().toast(message, "success", {
    detail: path,
    action: { label: "Mostrar en la carpeta", onClick: () => void revealInFolder(path).catch(() => {}) },
  });
}

function errorToast(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  const friendly = /denied|not allowed|forbidden|permission/i.test(msg)
    ? "No hay permiso para escribir en esa carpeta. Elige otra ubicación."
    : /used by another|being used|EBUSY|sharing violation/i.test(msg)
      ? "El archivo está abierto en otro programa (por ejemplo, Word). Ciérralo e inténtalo de nuevo."
      : `No se pudo guardar el archivo. ${msg}`;
  useApp.getState().toast(friendly, "error");
}

/* ------------------------------------------------------------------ */
/*  Acciones                                                           */
/* ------------------------------------------------------------------ */

/**
 * Guardar (Ctrl+S). Si el documento ya está vinculado a un archivo lo reemplaza;
 * si no, abre «Guardar como». Devuelve la ruta o null si se canceló.
 */
export async function saveDocument(doc: Pick<DocRecord, "id" | "filePath" | "fileFormat">, src: DocSource): Promise<string | null> {
  if (!isDesktop()) return downloadCopy(doc.fileFormat ?? "docx", src);
  if (!doc.filePath || !doc.fileFormat) return saveDocumentAs(doc, src);
  try {
    await writeFile(doc.filePath, await buildBytes(doc.fileFormat, src));
    await updateDoc(doc.id, { savedAt: Date.now() + 1 });
    savedToast(`Guardado en «${fileName(doc.filePath)}»`, doc.filePath);
    return doc.filePath;
  } catch (e) {
    errorToast(e);
    return null;
  }
}

/** Guardar como (Ctrl+Mayús+S): elige ubicación y formato, y vincula el documento a ese archivo. */
export async function saveDocumentAs(doc: Pick<DocRecord, "id" | "filePath" | "fileFormat">, src: DocSource): Promise<string | null> {
  if (!isDesktop()) return downloadCopy(doc.fileFormat ?? "docx", src);
  const preferred = doc.fileFormat ?? "docx";
  const path = await chooseSavePath(src.title, [preferred, ...SAVE_ORDER.filter((f) => f !== preferred)], doc.filePath);
  if (!path) return null;
  const format = formatFromPath(path) ?? preferred;
  try {
    await writeFile(path, await buildBytes(format, src));
    await updateDoc(doc.id, { filePath: path, fileFormat: format, savedAt: Date.now() + 1 });
    savedToast(`Guardado en «${fileName(path)}»`, path);
    return path;
  } catch (e) {
    errorToast(e);
    return null;
  }
}

/** Exportar: guarda una copia en el formato elegido, preguntando dónde. No cambia el archivo vinculado. */
export async function exportDocument(format: FileFormat, src: DocSource): Promise<string | null> {
  if (!isDesktop()) return downloadCopy(format, src);
  const path = await chooseSavePath(src.title, [format]);
  if (!path) return null;
  try {
    await writeFile(path, await buildBytes(format, src));
    savedToast(`Exportado como ${FORMATS[format].label.toLowerCase()}`, path);
    return path;
  } catch (e) {
    errorToast(e);
    return null;
  }
}

/** En el navegador no se puede elegir carpeta: se descarga una copia. */
async function downloadCopy(format: FileFormat, src: DocSource): Promise<null> {
  const name = `${safeFileName(src.title)}.${FORMATS[format].ext}`;
  saveAs(new Blob([(await buildBytes(format, src)) as BlobPart], { type: FORMATS[format].mime }), name);
  useApp.getState().toast(`Descargado «${name}»`, "success", { detail: "En tu carpeta de Descargas" });
  return null;
}

/** Abrir un archivo del disco. El documento queda vinculado a él para que «Guardar» lo reemplace. */
export async function openFileFromDisk(): Promise<DocRecord | null> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const picked = await open({
    title: "Abrir documento",
    multiple: false,
    directory: false,
    filters: [
      { name: "Documentos compatibles", extensions: ["docx", "lumen", "md", "markdown", "html", "htm", "txt"] },
      { name: "Documento de Word", extensions: ["docx"] },
      { name: "Documento de Lumen", extensions: ["lumen"] },
    ],
  });
  if (!picked || Array.isArray(picked)) return null;
  const fs = await import("@tauri-apps/plugin-fs");
  const bytes = await fs.readFile(picked);
  const name = fileName(picked);
  return importFromFile(new File([bytes as BlobPart], name), { filePath: picked, fileFormat: formatFromPath(picked) });
}
