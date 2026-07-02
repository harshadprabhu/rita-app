import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { QUERY_KEYS } from '../constants/queryKeys';
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '../lib/api/notifications';
import { useNotificationStore } from '../stores/notificationStore';
import { supabase } from '../lib/supabase';
import { DbNotification } from '../types';

export function useNotifications(userId: string) {
  const qc = useQueryClient();
  const setUnreadCount = useNotificationStore((s) => s.setUnreadCount);

  const query = useQuery({
    queryKey: QUERY_KEYS.notifications(userId),
    queryFn: () => getNotifications(userId),
    enabled: !!userId,
    staleTime: 30 * 1000,
  });

  // Keep global unread badge in sync
  useEffect(() => {
    if (query.data) {
      setUnreadCount(query.data.filter((n: DbNotification) => !n.is_read).length);
    }
  }, [query.data]);

  // Realtime: invalidate when a new notification row is inserted for this user
  useEffect(() => {
    if (!userId) return;

    // Unique name per effect invocation avoids a channel-dedup bug where
    // channel() can return a still-joining channel from a previous cleanup.
    const name = `notifs:${userId}:${Math.random().toString(36).slice(2, 9)}`;
    const channel = supabase
      .channel(name)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${userId}`,
        },
        () => { qc.invalidateQueries({ queryKey: QUERY_KEYS.notifications(userId) }); },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  return query;
}

export function useMarkRead(userId: string) {
  const qc = useQueryClient();
  const setUnreadCount = useNotificationStore((s) => s.setUnreadCount);

  const markOne = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEYS.notifications(userId) }),
  });

  const markAll = useMutation({
    mutationFn: () => markAllNotificationsRead(userId),
    onSuccess: () => {
      setUnreadCount(0);
      qc.invalidateQueries({ queryKey: QUERY_KEYS.notifications(userId) });
    },
  });

  return { markOne, markAll };
}
