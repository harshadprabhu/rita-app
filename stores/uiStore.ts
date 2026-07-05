import { create } from 'zustand';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface UiStore {
  toasts: Toast[];
  isGlobalLoading: boolean;
  /**
   * OAuth error captured from the URL at boot (see app/_layout.tsx). Supabase
   * redirects sign-in failures back with ?error_description=… — sometimes to
   * the Site URL root, not our callback route — so it can land on any page.
   * The login screen displays and clears this.
   */
  ssoError: string | null;
  showToast: (message: string, type?: Toast['type']) => void;
  dismissToast: (id: string) => void;
  setGlobalLoading: (loading: boolean) => void;
  setSsoError: (error: string | null) => void;
}

export const useUiStore = create<UiStore>((set) => ({
  toasts: [],
  isGlobalLoading: false,
  ssoError: null,
  showToast: (message, type = 'info') =>
    set((s) => ({
      toasts: [...s.toasts, { id: Date.now().toString(), message, type }],
    })),
  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setGlobalLoading: (isGlobalLoading) => set({ isGlobalLoading }),
  setSsoError: (ssoError) => set({ ssoError }),
}));
