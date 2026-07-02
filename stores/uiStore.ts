import { create } from 'zustand';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface UiStore {
  toasts: Toast[];
  isGlobalLoading: boolean;
  showToast: (message: string, type?: Toast['type']) => void;
  dismissToast: (id: string) => void;
  setGlobalLoading: (loading: boolean) => void;
}

export const useUiStore = create<UiStore>((set) => ({
  toasts: [],
  isGlobalLoading: false,
  showToast: (message, type = 'info') =>
    set((s) => ({
      toasts: [...s.toasts, { id: Date.now().toString(), message, type }],
    })),
  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setGlobalLoading: (isGlobalLoading) => set({ isGlobalLoading }),
}));
