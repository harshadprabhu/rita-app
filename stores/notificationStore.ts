import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface NotificationStore {
  unreadCount: number;
  setUnreadCount: (count: number) => void;
  incrementUnread: () => void;
  clearUnread: () => void;

  unreadAnnouncementCount: number;
  setUnreadAnnouncementCount: (count: number) => void;

  // Epoch ms of the last "Clear" in the Alerts inbox; items at/older than this
  // are hidden from the feed (announcements can't be per-user deleted).
  // Persisted so a Clear survives app restarts — otherwise cleared alerts
  // reappear the next time the app loads.
  alertsClearedAt: number;
  setAlertsClearedAt: (ts: number) => void;
}

export const useNotificationStore = create<NotificationStore>()(
  persist(
    (set) => ({
      unreadCount: 0,
      setUnreadCount: (unreadCount) => set({ unreadCount }),
      incrementUnread: () => set((s) => ({ unreadCount: s.unreadCount + 1 })),
      clearUnread: () => set({ unreadCount: 0 }),

      unreadAnnouncementCount: 0,
      setUnreadAnnouncementCount: (unreadAnnouncementCount) => set({ unreadAnnouncementCount }),

      alertsClearedAt: 0,
      setAlertsClearedAt: (alertsClearedAt) => set({ alertsClearedAt }),
    }),
    {
      name: 'rita-notifications',
      storage: createJSONStorage(() => AsyncStorage),
      // Only the cleared marker needs to survive restarts; the live counts are
      // recomputed from the server on every load.
      partialize: (s) => ({ alertsClearedAt: s.alertsClearedAt }),
    },
  ),
);
