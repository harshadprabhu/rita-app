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

  const markAllRead = () => {
    if (activeTab === 'alerts' && unreadTicketCount > 0) markAll.mutate();
    if (activeTab === 'announcements' && unreadAnnouncementCount > 0) markAllBroadcastsRead();
  };

  const clearAll = useMutation({
    mutationFn: async () => {
      await deleteAllNotifications(userId).catch(() => null);
      await markAllBroadcastsRead();
    },
    onSuccess: () => {
      setClearedAt(Date.now());
      qc.invalidateQueries({ queryKey: QUERY_KEYS.notifications(userId) });
      refetch();
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
