import { createDoc, touchDoc, type DocRecord } from "@/lib/db";
import { TEMPLATES } from "@/lib/templates";
import { useApp } from "@/store/app";

export function openDoc(doc: Pick<DocRecord, "id" | "kind">) {
  touchDoc(doc.id);
  const { navigate } = useApp.getState();
  if (doc.kind === "note") navigate({ name: "notes", id: doc.id });
  else if (doc.kind === "sheet") navigate({ name: "sheet", id: doc.id });
  else navigate({ name: "document", id: doc.id });
}

export async function createFromTemplate(templateId: string) {
  const tpl = TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES[0];
  const { title, content } = tpl.build();
  const doc = await createDoc(tpl.kind, { title, content });
  openDoc(doc);
  return doc;
}

export async function newDocument() {
  return createFromTemplate("blank");
}

export async function newNote() {
  const doc = await createDoc("note");
  openDoc(doc);
  return doc;
}

export async function newSheet(templateId = "blank") {
  const [{ sheetTemplate }, { workbookText }] = await Promise.all([import("@/lib/sheet/templates"), import("@/lib/sheet/model")]);
  const { title, wb } = sheetTemplate(templateId).build();
  const doc = await createDoc("sheet", { title, data: wb, text: workbookText(wb) });
  openDoc(doc);
  return doc;
}
