import { create } from "zustand";

export type UnsavedChoice = "save" | "discard" | "cancel";

interface ConfirmState {
  open: boolean;
  /** Nombres de los archivos con cambios sin guardar */
  files: string[];
  resolve: ((c: UnsavedChoice) => void) | null;
  /** Pregunta qué hacer con los cambios sin guardar y espera la respuesta */
  askUnsaved: (files: string[]) => Promise<UnsavedChoice>;
  answer: (c: UnsavedChoice) => void;
}

export const useConfirm = create<ConfirmState>((set, get) => ({
  open: false,
  files: [],
  resolve: null,
  askUnsaved: (files) =>
    new Promise<UnsavedChoice>((resolve) => {
      // Si ya había una pregunta abierta, se da por cancelada
      get().resolve?.("cancel");
      set({ open: true, files, resolve });
    }),
  answer: (c) => {
    get().resolve?.(c);
    set({ open: false, resolve: null });
  },
}));
