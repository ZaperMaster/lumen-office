import { createDoc, type DocRecord } from "@/lib/db";
import { importFromFile } from "@/lib/io";
import { useApp } from "@/store/app";
import { L } from "@/lib/i18n";

/** Extensiones que se pueden abrir en Lumen. */
export const ACCEPTED_FILES = ".docx,.pdf,.lumen,.md,.markdown,.html,.htm,.txt,.xlsx,.csv,.pptx";

const baseName = (name: string) => name.replace(/\.[^.]+$/, "");

type Kind = "docx" | "xlsx" | "pptx" | "csv" | "pdf" | "other";

/**
 * Qué es el archivo de verdad: los de Office son ZIP con una carpeta propia
 * (word/, xl/ o ppt/), así que se reconocen aunque la extensión esté mal.
 */
async function detect(file: File): Promise<Kind> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  // Los PDF empiezan por «%PDF»
  if (head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46) return "pdf";
  const isZip = head[0] === 0x50 && head[1] === 0x4b;
  if (isZip) {
    try {
      const { default: JSZip } = await import("jszip");
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      const names = Object.keys(zip.files);
      if (names.some((n) => n.startsWith("word/"))) return "docx";
      if (names.some((n) => n.startsWith("xl/"))) return "xlsx";
      if (names.some((n) => n.startsWith("ppt/"))) return "pptx";
    } catch {
      // No es un ZIP válido: se decide por la extensión
    }
  }
  if (ext === "docx" || ext === "xlsx" || ext === "pptx" || ext === "csv") return ext;
  return "other";
}

const OLD_FORMATS: Record<string, string> = {
  doc: "Es un documento de Word antiguo (.doc). Ábrelo en Word y guárdalo como .docx para poder abrirlo aquí.",
  xls: "Es un libro de Excel antiguo (.xls). Ábrelo en Excel y guárdalo como .xlsx para poder abrirlo aquí.",
  ppt: "Es una presentación antigua (.ppt). Ábrela en PowerPoint y guárdala como .pptx para poder abrirla aquí.",
  odt: "Es un documento de LibreOffice (.odt). Guárdalo como .docx para poder abrirlo aquí.",
  ods: "Es una hoja de LibreOffice (.ods). Guárdala como .xlsx para poder abrirla aquí.",
  odp: "Es una presentación de LibreOffice (.odp). Guárdala como .pptx para poder abrirla aquí.",
};

const LABEL: Record<DocRecord["kind"], string> = { document: "Documentos", sheet: "Hojas de cálculo", slides: "Presentaciones", note: "Notas" };

/** Abre cualquier archivo compatible: documento, hoja de cálculo o presentación. */
export async function importAnyFile(file: File, extra: Partial<Pick<DocRecord, "filePath" | "fileFormat">> = {}): Promise<DocRecord> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (OLD_FORMATS[ext]) throw new Error(OLD_FORMATS[ext]);
  const kind = await detect(file);
  let doc: DocRecord;
  if (kind === "xlsx" || kind === "csv") {
    const [{ readXlsx, readCsv }, { workbookText }] = await Promise.all([import("@/lib/sheet/xlsx"), import("@/lib/sheet/model")]);
    let wb;
    try {
      wb = kind === "csv" ? readCsv(await file.text(), baseName(file.name)) : await readXlsx(await file.arrayBuffer());
    } catch {
      throw new Error(`No se pudo leer «${file.name}». ¿Es un libro de Excel válido?`);
    }
    doc = await createDoc("sheet", { title: baseName(file.name), data: wb, text: workbookText(wb), ...extra, fileFormat: extra.fileFormat ? kind : undefined });
  } else if (kind === "pdf") {
    // El PDF se convierte en un documento nuevo (no queda vinculado al PDF: al guardar se elige formato)
    const [{ readPdf }, { htmlToJSON }] = await Promise.all([import("@/lib/pdfImport"), import("@/lib/io")]);
    let html: string;
    try {
      html = (await readPdf(await file.arrayBuffer())).html;
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      throw new Error(/password/i.test(msg) ? L("«{0}» está protegido con contraseña.", file.name) : L("No se pudo leer «{0}». ¿Es un PDF válido?", file.name));
    }
    if (!html) throw new Error(L("«{0}» no tiene texto que se pueda leer (parece un documento escaneado).", file.name));
    doc = await createDoc("document", { title: baseName(file.name), content: htmlToJSON(html) });
    useApp.getState().toast(L("«{0}» convertido en documento", file.name), "success", { detail: L("Revisa el formato: los PDF no guardan la estructura original del documento.") });
    return doc;
  } else if (kind === "pptx") {
    const [{ readPptx }, { deckText }] = await Promise.all([import("@/lib/slides/pptx"), import("@/lib/slides/model")]);
    let deck;
    try {
      deck = await readPptx(await file.arrayBuffer());
    } catch {
      throw new Error(`No se pudo leer «${file.name}». ¿Es una presentación de PowerPoint válida?`);
    }
    doc = await createDoc("slides", { title: baseName(file.name), data: deck, text: deckText(deck), ...extra, fileFormat: extra.fileFormat ? "pptx" : undefined });
  } else {
    // Un .docx con otra extensión se abre como Word
    const asFile = kind === "docx" && ext !== "docx" ? new File([file], `${baseName(file.name)}.docx`) : file;
    doc = await importFromFile(asFile, kind === "docx" && extra.fileFormat ? { ...extra, fileFormat: "docx" } : extra);
  }
  useApp.getState().toast(`«${file.name}» abierto en ${LABEL[doc.kind]}`, "success");
  return doc;
}
