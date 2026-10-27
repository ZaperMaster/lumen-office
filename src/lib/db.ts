import Dexie, { type EntityTable } from "dexie";
import type { JSONContent } from "@tiptap/react";

export type DocKind = "document" | "note";

export interface DocRecord {
  id: string;
  kind: DocKind;
  title: string;
  content: JSONContent;
  /** Texto plano, para búsqueda y vista previa */
  text: string;
  words: number;
  createdAt: number;
  updatedAt: number;
  openedAt: number;
  pinned: 0 | 1;
  favorite: 0 | 1;
  /** null = no está en la papelera */
  deletedAt: number | null;
  color: string | null;
  tags: string[];
  /** Archivo del disco al que está vinculado (Guardar lo sobrescribe) */
  filePath?: string | null;
  fileFormat?: FileFormat | null;
  /** Momento del último guardado en ese archivo */
  savedAt?: number | null;
}

export type FileFormat = "docx" | "lumen" | "md" | "html" | "txt";

class LumenDB extends Dexie {
  docs!: EntityTable<DocRecord, "id">;

  constructor() {
    super("lumen");
    this.version(1).stores({
      docs: "id, kind, updatedAt, openedAt, pinned, favorite, deletedAt, *tags",
    });
  }
}

export const db = new LumenDB();

export function newId(): string {
  return crypto.randomUUID();
}

export async function createDoc(
  kind: DocKind,
  init: Partial<Pick<DocRecord, "title" | "content" | "color" | "tags" | "filePath" | "fileFormat">> = {},
): Promise<DocRecord> {
  const now = Date.now();
  const doc: DocRecord = {
    id: newId(),
    kind,
    title: init.title ?? "",
    content: init.content ?? { type: "doc", content: [{ type: "paragraph" }] },
    text: "",
    words: 0,
    createdAt: now,
    updatedAt: now,
    openedAt: now,
    pinned: 0,
    favorite: 0,
    deletedAt: null,
    color: init.color ?? null,
    tags: init.tags ?? [],
    filePath: init.filePath ?? null,
    fileFormat: init.fileFormat ?? null,
    savedAt: init.filePath ? now : null,
  };
  doc.text = plainText(doc.content);
  doc.words = countWords(doc.text);
  await db.docs.add(doc);
  return doc;
}

export async function updateDoc(id: string, patch: Partial<DocRecord>) {
  await db.docs.update(id, { ...patch, updatedAt: Date.now() });
}

export async function touchDoc(id: string) {
  await db.docs.update(id, { openedAt: Date.now() });
}

export async function trashDoc(id: string) {
  await db.docs.update(id, { deletedAt: Date.now(), pinned: 0 });
}

export async function restoreDoc(id: string) {
  await db.docs.update(id, { deletedAt: null });
}

export async function deleteForever(id: string) {
  await db.docs.delete(id);
}

export async function duplicateDoc(id: string): Promise<DocRecord | null> {
  const src = await db.docs.get(id);
  if (!src) return null;
  return createDoc(src.kind, {
    title: `${src.title || "Sin título"} (copia)`,
    content: structuredClone(src.content),
    color: src.color,
    tags: [...src.tags],
  });
}

const BLOCK_TYPES = new Set(["paragraph", "heading", "codeBlock", "tableCell", "tableHeader"]);

/** Extrae el texto plano de un documento Tiptap. */
export function plainText(node: JSONContent): string {
  const out: string[] = [];
  const walk = (n: JSONContent) => {
    if (n.type === "text" && n.text) out.push(n.text);
    if (n.type === "hardBreak") out.push("\n");
    n.content?.forEach(walk);
    if (n.type && BLOCK_TYPES.has(n.type)) out.push("\n");
  };
  walk(node);
  return out.join("").replace(/\n{3,}/g, "\n\n").trim();
}

export function countWords(text: string): number {
  const m = text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu);
  return m ? m.length : 0;
}

export function displayTitle(doc: Pick<DocRecord, "title" | "text" | "kind">): string {
  if (doc.title.trim()) return doc.title.trim();
  const first = doc.text.split("\n").find((l) => l.trim());
  if (first) return first.slice(0, 60);
  return doc.kind === "note" ? "Nota sin título" : "Documento sin título";
}
