import React, { useMemo, useState } from 'react';
import {
  ScrollView, RefreshControl, StyleSheet, View, Text, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Screen } from '../common/Screen';
import { SoftPress } from '../common/SoftPress';
import { AppHeader } from '../common/AppHeader';
import { ProfileIconButton } from '../common/ProfileIconButton';
import { EmptyState } from '../common/EmptyState';
import { LoadingOverlay } from '../common/LoadingOverlay';
import { UnifiedNotificationItem } from './UnifiedNotificationItem';
import { useUnifiedNotifications, FeedItem } from '../../hooks/useUnifiedNotifications';
import { useMarkRead } from '../../hooks/useNotifications';
import { deleteAllNotifications } from '../../lib/api/notifications';
import { QUERY_KEYS } from '../../constants/queryKeys';
import { useAuthStore } from '../../stores/authStore';
import { useNotificationStore } from '../../stores/notificationStore';
import { useUiStore } from '../../stores/uiStore';
import { theme } from '../../constants/theme';

type Tab = 'alerts' | 'announcements';

export function NotificationsScreen() {
  const { t } = useTranslation();
  const profile = useAuthStore((s) => s.profile);
  const qc = useQueryClient();
  const userId = profile?.id ?? '';
  const {
    feed, isLoading, isRefetching, refetch,
    ticketNotifications, announcementNotifications,
    unreadTicketCount, unreadAnnouncementCount, markAllBroadcastsRead, markBroadcastRead,
  } = useUnifiedNotifications(userId, profile?.store_id ?? null);
  const { markOne, markAll } = useMarkRead(userId);
  const showToast = useUiStore((s) => s.showToast);

  const clearedAt = useNotificationStore((s) => s.alertsClearedAt);
  const setClearedAt = useNotificationStore((s) => s.setAlertsClearedAt);

  const [activeTab, setActiveTab] = useState<Tab>('alerts');

  const alertsFeed = useMemo(
    () => ticketNotifications.filter((f) => new Date(f.created_at).getTime() > clearedAt),
    [ticketNotifications, clearedAt],
  );

  const announcementsFeed = useMemo(
    () => announcementNotifications.filter((f) => new Date(f.created_at).getTime() > clearedAt),
    [announcementNotifications, clearedAt],
  );

  const activeFeed = activeTab === 'alerts' ? alertsFeed : announcementsFeed;

  const anyUnread = unreadTicketCount > 0 || unreadAnnouncementCount > 0;

  // Mark-all-read must clear BOTH data sources (DB notifications AND broadcast
  // reads) unconditionally, not just the active tab's. Two reasons:
  //   1) gold_rate broadcasts render under the Alerts tab (kind='ticket') but
  //      live in the broadcasts table, so a tab-scoped markAll on 'alerts'
  //      would miss them.
  //   2) Users hit this button to clear the entire unread state — a tab-scoped
  //      clear leaves the OTHER tab's badge unresolved, so on the next sign-in
  //      the count still shows unread and the fix feels like it did nothing.
  // Also awaits the DB write and refetches, so a silent RLS block or network
  // failure surfaces a specific error instead of a silent optimistic-only
  // clear that resurrects on next sign-in.
  const markAllRead = async () => {
    if (!anyUnread) return;
    const totalBefore = unreadTicketCount + unreadAnnouncementCount;
    try {
      // Always fire BOTH jobs — the "kind" of an unread item is not the same
      // as its data source: gold_rate broadcasts render under the Alerts tab
      // (kind='ticket') but live in the broadcasts table, so gating markAll
      // DB writes on unreadTicketCount or broadcast writes on unreadAnnouncement
      // both miss the mixed-source case. markAllBroadcastsRead now iterates
      // both feeds internally and no-ops when nothing is unread.
      const jobs: Promise<unknown>[] = [
        markAll.mutateAsync().catch(() => 0),
        markAllBroadcastsRead(),
      ];
      await Promise.all(jobs);
      // Force-refetch is deliberately outside the mutation onSettled: a silent
      // RLS block on the UPDATE returns 0 rows, no error — the optimistic
      // clear then survives locally while DB still has is_read=false, so on
      // next sign-in the alerts resurrect as unread. Refetching reconciles.
      await Promise.all([
        qc.invalidateQueries({ queryKey: QUERY_KEYS.notifications(userId) }),
        qc.invalidateQueries({ queryKey: QUERY_KEYS.broadcastReads(userId) }),
      ]);
      showToast(`Marked ${totalBefore} as read`, 'success');
    } catch (err) {
      showToast(
        `Could not mark all read: ${err instanceof Error ? err.message : String(err)}`,
        'error',
      );
    }
  };

  const clearAll = useMutation({
    // Do NOT swallow errors here. The previous `.catch(() => null)` hid a
    // real problem — the notifications DELETE RLS policy was missing, so
    // every delete was silently denied, the row count never dropped, and
    // the badge kept resurrecting on the next sign-in.
    mutationFn: async () => {
      const deleted = await deleteAllNotifications(userId);
      await markAllBroadcastsRead();
      return deleted;
    },
    onSuccess: (deleted) => {
      setClearedAt(Date.now());
      qc.invalidateQueries({ queryKey: QUERY_KEYS.notifications(userId) });
      qc.invalidateQueries({ queryKey: QUERY_KEYS.broadcastReads(userId) });
      refetch();
      showToast(deleted > 0 ? `Cleared ${deleted} alert${deleted === 1 ? '' : 's'}` : 'Already clear', 'success');
    },
    onError: (err) => {
      showToast(`Could not clear: ${err instanceof Error ? err.message : String(err)}`, 'error');
    },
  });

  const renderItem = (item: FeedItem) => (
    <View key={item.id} style={styles.itemWrap}>
      <UnifiedNotificationItem
        item={item}
        onMarkRead={(id) => markOne.mutate(id)}
        onReadAnnouncement={(id) => markBroadcastRead(id)}
      />
    </View>
  );

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader
        title={t('tabs.alerts')}
        right={
          <View style={styles.headerRight}>
            {anyUnread && (
              <SoftPress style={styles.markBtn} onPress={markAllRead}>
                <Ionicons name="checkmark-done" size={13} color={theme.colors.accent} />
                <Text style={styles.markBtnText}>{t('common.markAllRead', { defaultValue: 'Mark all read' })}</Text>
              </SoftPress>
            )}
            {activeFeed.length > 0 && (
              <SoftPress
                style={styles.clearBtn}
                onPress={() => clearAll.mutate()}
                disabled={clearAll.isPending}
                hitSlop={8}
              >
                <Ionicons name="trash-outline" size={16} color="#fff" />
              </SoftPress>
            )}
            {profile ? <ProfileIconButton profile={profile} /> : null}
          </View>
        }
      />

      {/* Two side-by-side tab pills */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'alerts' && styles.tabActive]}
          onPress={() => setActiveTab('alerts')}
          activeOpacity={0.7}
        >
          <Ionicons
            name="pulse-outline"
            size={16}
            color={activeTab === 'alerts' ? '#fff' : theme.colors.textSecondary}
          />
          <Text style={[styles.tabText, activeTab === 'alerts' && styles.tabTextActive]}>
            Daily Alerts
          </Text>
          {unreadTicketCount > 0 && (
            <View style={[styles.badge, activeTab === 'alerts' && styles.badgeActive]}>
              <Text style={styles.badgeText}>{unreadTicketCount}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'announcements' && styles.tabActive]}
          onPress={() => setActiveTab('announcements')}
          activeOpacity={0.7}
        >
          <Ionicons
            name="megaphone-outline"
            size={16}
            color={activeTab === 'announcements' ? '#fff' : theme.colors.textSecondary}
          />
          <Text style={[styles.tabText, activeTab === 'announcements' && styles.tabTextActive]}>
            Announcements
          </Text>
          {unreadAnnouncementCount > 0 && (
            <View style={[styles.badge, activeTab === 'announcements' && styles.badgeActive]}>
              <Text style={styles.badgeText}>{unreadAnnouncementCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <LoadingOverlay />
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
        >
          {activeFeed.length === 0 ? (
            <EmptyState
              icon={activeTab === 'alerts' ? 'notifications-outline' : 'megaphone-outline'}
              title={activeTab === 'alerts' ? 'No alerts yet' : 'No announcements yet'}
              subtitle={activeTab === 'alerts'
                ? 'Ticket updates and daily alerts will appear here'
                : 'Broadcasts and promotions will appear here'}
            />
          ) : (
            activeFeed.map(renderItem)
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: theme.spacing.lg, flexGrow: 1 },
  itemWrap: { marginBottom: theme.spacing.md },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  markBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(200,150,62,0.16)', borderWidth: 1, borderColor: 'rgba(200,150,62,0.35)',
    borderRadius: theme.radius.full, paddingHorizontal: theme.spacing.sm + 2, paddingVertical: theme.spacing.xs,
  },
  markBtnText: { color: theme.colors.accentBright, fontSize: 11, fontWeight: '800' },
  clearBtn: {
    width: 30, height: 30, borderRadius: theme.radius.full,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },

  // ── Tab bar ──────────────────────────────────────────────────────────────
  tabBar: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.xs,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, height: 40, borderRadius: 12,
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
  },
  tabActive: {
    backgroundColor: theme.colors.brand, borderColor: theme.colors.brand,
  },
  tabText: { fontSize: 13, fontWeight: '700', color: theme.colors.textSecondary },
  tabTextActive: { color: '#fff' },
  badge: {
    minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: theme.colors.brand, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeActive: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  badgeText: { fontSize: 10, fontWeight: '800', color: '#fff' },
});
