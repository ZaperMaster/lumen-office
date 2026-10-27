import { create } from "zustand";

export type Route =
  | { name: "home"; section?: "home" | "new" | "open" | "trash" }
  | { name: "document"; id: string }
  | { name: "notes"; id?: string }
  | { name: "assistant" };

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export type Toast = { id: number; message: string; detail?: string; tone?: "info" | "success" | "error"; action?: ToastAction };

interface AppState {
  route: Route;
  settingsOpen: boolean;
  settingsTab: string;
  toasts: Toast[];
  /** Se consulta antes de salir de la pantalla actual (p. ej. cambios sin guardar en el archivo) */
  leaveGuard: (() => Promise<boolean>) | null;
  setLeaveGuard: (g: (() => Promise<boolean>) | null) => void;
  navigate: (r: Route) => void;
  openSettings: (tab?: string) => void;
  closeSettings: () => void;
  toast: (message: string, tone?: Toast["tone"], extra?: { detail?: string; action?: ToastAction }) => void;
  dismissToast: (id: number) => void;
}

let toastId = 0;

export const useApp = create<AppState>((set, get) => ({
  route: { name: "home" },
  settingsOpen: false,
  settingsTab: "appearance",
  toasts: [],
  leaveGuard: null,
  setLeaveGuard: (leaveGuard) => set({ leaveGuard }),
  navigate: (route) => {
    const guard = get().leaveGuard;
    if (!guard) return set({ route });
    void guard().then((ok) => {
      if (ok) set({ route });
    });
  },
  openSettings: (tab = "appearance") => set({ settingsOpen: true, settingsTab: tab }),
  closeSettings: () => set({ settingsOpen: false }),
  toast: (message, tone = "info", extra = {}) => {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts, { id, message, tone, ...extra }] }));
    // Los avisos con detalle o botón duran más para dar tiempo a leerlos
    const ms = extra.action || extra.detail ? 7000 : 3200;
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ms);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
