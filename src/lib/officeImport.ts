import { createDoc, type DocRecord } from "@/lib/db";
import { importFromFile } from "@/lib/io";

/** Extensiones que se pueden abrir en Lumen. */
export const ACCEPTED_FILES = ".docx,.lumen,.md,.markdown,.html,.htm,.txt,.xlsx,.csv,.pptx";

const baseName = (name: string) => name.replace(/\.[^.]+$/, "");

/** Abre cualquier archivo compatible: documento, hoja de cálculo o presentación. */
export async function importAnyFile(file: File, extra: Partial<Pick<DocRecord, "filePath" | "fileFormat">> = {}): Promise<DocRecord> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "xlsx" || ext === "csv") {
    const [{ readXlsx, readCsv }, { workbookText }] = await Promise.all([import("@/lib/sheet/xlsx"), import("@/lib/sheet/model")]);
    let wb;
    try {
      wb = ext === "csv" ? readCsv(await file.text(), baseName(file.name)) : await readXlsx(await file.arrayBuffer());
    } catch {
      throw new Error(`No se pudo leer «${file.name}». ¿Es un libro de Excel válido?`);
    }
    return createDoc("sheet", { title: baseName(file.name), data: wb, text: workbookText(wb), ...extra });
  }
  if (ext === "pptx") {
    const [{ readPptx }, { deckText }] = await Promise.all([import("@/lib/slides/pptx"), import("@/lib/slides/model")]);
    let deck;
    try {
      deck = await readPptx(await file.arrayBuffer());
    } catch {
      throw new Error(`No se pudo leer «${file.name}». ¿Es una presentación de PowerPoint válida?`);
    }
    return createDoc("slides", { title: baseName(file.name), data: deck, text: deckText(deck), ...extra });
  }
  return importFromFile(file, extra);
}
