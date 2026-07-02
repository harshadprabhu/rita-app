import { create } from 'zustand';

interface NotificationStore {
  unreadCount: number;
  setUnreadCount: (count: number) => void;
  incrementUnread: () => void;
  clearUnread: () => void;

  unreadAnnouncementCount: number;
  setUnreadAnnouncementCount: (count: number) => void;
}

export const useNotificationStore = create<NotificationStore>((set) => ({
  unreadCount: 0,
  setUnreadCount: (unreadCount) => set({ unreadCount }),
  incrementUnread: () => set((s) => ({ unreadCount: s.unreadCount + 1 })),
  clearUnread: () => set({ unreadCount: 0 }),

  unreadAnnouncementCount: 0,
  setUnreadAnnouncementCount: (unreadAnnouncementCount) => set({ unreadAnnouncementCount }),
}));
