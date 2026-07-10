import { create } from 'zustand';

interface NotificationStore {
  unreadCount: number;
  setUnreadCount: (count: number) => void;
  incrementUnread: () => void;
  clearUnread: () => void;

  unreadAnnouncementCount: number;
  setUnreadAnnouncementCount: (count: number) => void;

  // Epoch ms of the last "Clear" in the Alerts inbox; items at/older than this
  // are hidden from the feed (announcements can't be per-user deleted).
  alertsClearedAt: number;
  setAlertsClearedAt: (ts: number) => void;
}

export const useNotificationStore = create<NotificationStore>((set) => ({
  unreadCount: 0,
  setUnreadCount: (unreadCount) => set({ unreadCount }),
  incrementUnread: () => set((s) => ({ unreadCount: s.unreadCount + 1 })),
  clearUnread: () => set({ unreadCount: 0 }),

  unreadAnnouncementCount: 0,
  setUnreadAnnouncementCount: (unreadAnnouncementCount) => set({ unreadAnnouncementCount }),

  alertsClearedAt: 0,
  setAlertsClearedAt: (alertsClearedAt) => set({ alertsClearedAt }),
}));
