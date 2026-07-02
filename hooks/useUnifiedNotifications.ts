import { useMemo, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DbNotification, DbBroadcast, NotificationType } from '../types';
import { QUERY_KEYS } from '../constants/queryKeys';
import { useNotifications } from './useNotifications';
import { getBroadcastsForStore, getBroadcastReadIds, markBroadcastsRead } from '../lib/api/broadcasts';
import { supabase } from '../lib/supabase';
import { useNotificationStore } from '../stores/notificationStore';

export type NotificationKind = 'ticket' | 'announcement';

export interface FeedItem {
  id: string;
  kind: NotificationKind;
  /** Populated for kind=ticket — distinguishes comment / assigned / resolved etc. */
  notificationType?: NotificationType | null;
  title: string;
  body: string | null;
  created_at: string;
  is_read?: boolean;
  ticket_id?: string | null;
  /** Original record -- use for mutation callbacks. */
  notificationId?: string; // set only for kind=ticket
  broadcastId?: string;    // set only for kind=announcement
}

/**
 * Merge ticket notifications + broadcasts into a single chronological feed.
 *
 * @param userId     Current user's profile.id
 * @param storeId    User's store_id (null for admins who see all)
 */
export function useUnifiedNotifications(userId: string, storeId: string | null) {
  const qc = useQueryClient();
  const notifQuery = useNotifications(userId);

  const broadcastQuery = useQuery({
    queryKey: [...QUERY_KEYS.broadcasts(), 'for-store', storeId],
    queryFn: () => getBroadcastsForStore(storeId),
    enabled: !!userId,
    staleTime: 60 * 1000,
  });

  const broadcastReadsQuery = useQuery({
    queryKey: QUERY_KEYS.broadcastReads(userId),
    queryFn: () => getBroadcastReadIds(userId),
    enabled: !!userId,
    staleTime: 30 * 1000,
  });

  // Realtime: invalidate broadcasts feed when new broadcast is inserted
  useEffect(() => {
    if (!userId) return;
    const name = `broadcasts:${userId}:${Math.random().toString(36).slice(2, 9)}`;
    const channel = supabase
      .channel(name)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'broadcasts' },
        () => { qc.invalidateQueries({ queryKey: QUERY_KEYS.broadcasts() }); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  // Realtime: invalidate read-set when user reads a broadcast
  useEffect(() => {
    if (!userId) return;
    const name = `bcast-reads:${userId}:${Math.random().toString(36).slice(2, 9)}`;
    const channel = supabase
      .channel(name)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'broadcast_reads',
          filter: `user_id=eq.${userId}`,
        },
        () => { qc.invalidateQueries({ queryKey: QUERY_KEYS.broadcastReads(userId) }); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  const { feed, ticketNotifications, announcementNotifications } = useMemo(() => {
    const readIds = broadcastReadsQuery.data ?? new Set<string>();

    const notifItems: FeedItem[] = (notifQuery.data ?? []).map(
      (n: DbNotification) => ({
        id: 'n-' + n.id,
        kind: (n.type === 'broadcast' ? 'announcement' : 'ticket') as NotificationKind,
        notificationType: n.type,
        title: n.title,
        body: n.body,
        created_at: n.created_at,
        is_read: n.is_read,
        ticket_id: n.ticket_id,
        notificationId: n.id,
      }),
    );

    const broadcastItems: FeedItem[] = (broadcastQuery.data ?? []).map(
      (b: DbBroadcast) => ({
        id: 'b-' + b.id,
        kind: 'announcement' as NotificationKind,
        title: b.title,
        body: b.body,
        created_at: b.created_at,
        is_read: readIds.has(b.id),
        ticket_id: null,
        broadcastId: b.id,
      }),
    );

    const all = [...notifItems, ...broadcastItems].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    const tickets = all.filter((item) => item.kind === 'ticket');
    const announcements = all.filter((item) => item.kind === 'announcement');

    return { feed: all, ticketNotifications: tickets, announcementNotifications: announcements };
  }, [notifQuery.data, broadcastQuery.data, broadcastReadsQuery.data]);

  const unreadTicketCount = ticketNotifications.filter((n) => n.is_read === false).length;
  const unreadAnnouncementCount = announcementNotifications.filter((n) => !n.is_read).length;

  const setUnreadAnnouncementCount = useNotificationStore((s) => s.setUnreadAnnouncementCount);

  // Keep the global store (bottom-bar badge) in sync with announcement unread count
  useEffect(() => {
    setUnreadAnnouncementCount(unreadAnnouncementCount);
  }, [unreadAnnouncementCount]);

  const markAllBroadcastsRead = useCallback(async () => {
    if (!userId) return;
    const unreadIds = announcementNotifications
      .filter((n) => !n.is_read && n.broadcastId)
      .map((n) => n.broadcastId as string);
    if (!unreadIds.length) return;
    await markBroadcastsRead(userId, unreadIds);
    setUnreadAnnouncementCount(0);
    qc.invalidateQueries({ queryKey: QUERY_KEYS.broadcastReads(userId) });
  }, [userId, announcementNotifications, qc]);

  return {
    feed,
    ticketNotifications,
    announcementNotifications,
    unreadTicketCount,
    unreadAnnouncementCount,
    markAllBroadcastsRead,
    isLoading: notifQuery.isLoading || broadcastQuery.isLoading,
    isRefetching: notifQuery.isRefetching || broadcastQuery.isRefetching,
    refetch: async () => {
      await Promise.all([
        notifQuery.refetch(),
        broadcastQuery.refetch(),
        broadcastReadsQuery.refetch(),
      ]);
    },
  };
}
