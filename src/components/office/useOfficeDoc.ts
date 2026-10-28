import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { updateDoc, type DocRecord, type FileFormat } from "@/lib/db";
import {
  exportDocument, fileName, isDesktop, registerOpenDoc, saveDocument, saveDocumentAs, writeLinkedFile, type FileSource,
} from "@/lib/files";
import { useApp } from "@/store/app";
import { useConfirm } from "@/store/confirm";
import { useSettings } from "@/store/settings";

/*
 * Guardado de hojas de cálculo y presentaciones, igual que los documentos:
 *  - En la base interna, medio segundo después de cada cambio.
 *  - En el archivo vinculado del disco (Guardar, Guardar como, autoguardado).
 *  - Aviso al salir o cerrar con cambios sin guardar en el archivo.
 */

export interface OfficeFiles {
  filePath: string | null;
  save: () => void;
  saveAs: () => void;
  exportAs: (format: FileFormat) => void;
}

export function useOfficeDoc<T>({
  doc,
  data,
  title,
  text,
  build,
  order,
}: {
  doc: DocRecord;
  data: T;
  title: string;
  /** Texto plano para la búsqueda y la vista previa */
  text: (data: T) => string;
  build: (format: FileFormat, data: T, title: string) => Promise<Uint8Array>;
  /** Formatos para Guardar, el primero es el preferido */
  order: FileFormat[];
}) {
  const toast = useApp((s) => s.toast);
  const [saveState, setSaveState] = useState<"saved" | "saving">("saved");
  const dataRef = useRef(data);
  dataRef.current = data;
  const titleRef = useRef(title);
  titleRef.current = title;
  const docRef = useRef(doc);
  docRef.current = doc;
  const textRef = useRef(text);
  textRef.current = text;
  const buildRef = useRef(build);
  buildRef.current = build;

  /* ---------------- Base interna ---------------- */
  const pending = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const saveNow = useCallback(async () => {
    clearTimeout(timer.current);
    if (!pending.current) return;
    pending.current = false;
    await updateDoc(docRef.current.id, { data: dataRef.current, title: titleRef.current, text: textRef.current(dataRef.current) });
    setSaveState("saved");
  }, []);

  const edits = useRef((doc.savedAt ?? 0) < doc.updatedAt ? 1 : 0);
  const writtenEdits = useRef(0);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    edits.current += 1;
    pending.current = true;
    setSaveState("saving");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void saveNow(), 500);
  }, [data, title, saveNow]);
  // Al salir se guarda lo pendiente
  useEffect(() => () => void saveNow(), [saveNow]);

  /* ---------------- Archivo del disco ---------------- */
  const source = useCallback(
    (): FileSource => ({ title: titleRef.current, build: (f) => buildRef.current(f, dataRef.current, titleRef.current) }),
    [],
  );
  const [diskState, setDiskState] = useState<"idle" | "saving" | "error">("idle");
  const failed = useRef(false);
  const isDirty = useCallback(() => !!docRef.current.filePath && edits.current > writtenEdits.current, []);

  const writeNow = useCallback(async (): Promise<boolean> => {
    const d = docRef.current;
    if (!d.filePath || !isDesktop()) return true;
    await saveNow();
    setDiskState("saving");
    const upTo = edits.current;
    try {
      await writeLinkedFile(d, source());
      writtenEdits.current = Math.max(writtenEdits.current, upTo);
      setDiskState("idle");
      if (failed.current) {
        failed.current = false;
        toast(`Guardado de nuevo en «${fileName(d.filePath)}»`, "success");
      }
      return true;
    } catch (e) {
      setDiskState("error");
      if (!failed.current) {
        failed.current = true;
        toast(`No se pudo guardar automáticamente en «${fileName(d.filePath)}»`, "error", { detail: e instanceof Error ? e.message : String(e) });
      }
      return false;
    }
  }, [saveNow, source, toast]);

  const files: OfficeFiles = useMemo(
    () => ({
      filePath: doc.filePath ?? null,
      save: () => {
        void saveNow();
        const upTo = edits.current;
        void saveDocument(docRef.current, source(), order).then((p) => {
          if (p) writtenEdits.current = Math.max(writtenEdits.current, upTo);
        });
      },
      saveAs: () => {
        void saveNow();
        const upTo = edits.current;
        void saveDocumentAs(docRef.current, source(), order).then((p) => {
          if (p) writtenEdits.current = Math.max(writtenEdits.current, upTo);
        });
      },
      exportAs: (format) => void exportDocument(format, source()),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc.filePath, saveNow, source],
  );

  const autoSave = useSettings((s) => s.fileAutoSave);
  const unsavedFile = !!doc.filePath && (doc.savedAt ?? 0) < doc.updatedAt;
  useEffect(() => {
    if (!autoSave || !isDesktop() || !doc.filePath || !unsavedFile) return;
    const t = setTimeout(() => void writeNow(), 2000);
    return () => clearTimeout(t);
  }, [autoSave, doc.filePath, doc.updatedAt, unsavedFile, writeNow]);

  useEffect(
    () =>
      registerOpenDoc({
        id: doc.id,
        title: () => titleRef.current,
        path: () => docRef.current.filePath ?? null,
        dirty: isDirty,
        save: writeNow,
        flush: saveNow,
      }),
    [doc.id, isDirty, writeNow, saveNow],
  );

  const setLeaveGuard = useApp((s) => s.setLeaveGuard);
  useEffect(() => {
    const guard = async () => {
      await saveNow();
      const d = docRef.current;
      if (!isDesktop() || !d.filePath || !isDirty()) return true;
      if (useSettings.getState().fileAutoSave && (await writeNow())) return true;
      const choice = await useConfirm.getState().askUnsaved([fileName(d.filePath)]);
      if (choice === "cancel") return false;
      if (choice === "save") return writeNow();
      return true;
    };
    setLeaveGuard(guard);
    return () => {
      if (useApp.getState().leaveGuard === guard) setLeaveGuard(null);
    };
  }, [isDirty, setLeaveGuard, writeNow, saveNow]);

  return { saveState, saveNow, files, diskState, unsavedFile, autoSave };
}
