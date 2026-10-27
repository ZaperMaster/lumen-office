import { create } from "zustand";

export type Route =
  | { name: "home"; section?: "home" | "new" | "open" | "trash" }
  | { name: "document"; id: string }
  | { name: "notes"; id?: string }
  | { name: "assistant" };

export type Toast = { id: number; message: string; tone?: "info" | "success" | "error" };

interface AppState {
  route: Route;
  settingsOpen: boolean;
  settingsTab: string;
  toasts: Toast[];
  navigate: (r: Route) => void;
  openSettings: (tab?: string) => void;
  closeSettings: () => void;
  toast: (message: string, tone?: Toast["tone"]) => void;
  dismissToast: (id: number) => void;
}

let toastId = 0;

export const useApp = create<AppState>((set) => ({
  route: { name: "home" },
  settingsOpen: false,
  settingsTab: "appearance",
  toasts: [],
  navigate: (route) => set({ route }),
  openSettings: (tab = "appearance") => set({ settingsOpen: true, settingsTab: tab }),
  closeSettings: () => set({ settingsOpen: false }),
  toast: (message, tone = "info") => {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts, { id, message, tone }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3200);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
