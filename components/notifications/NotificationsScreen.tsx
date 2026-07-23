import React, { useMemo } from 'react';
import { FlatList, RefreshControl, StyleSheet, View, TouchableOpacity, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Screen } from '../common/Screen';
import { AppHeader } from '../common/AppHeader';
import { ProfileIconButton } from '../common/ProfileIconButton';
import { EmptyState } from '../common/EmptyState';
import { LoadingOverlay } from '../common/LoadingOverlay';
import { UnifiedNotificationItem } from './UnifiedNotificationItem';
import { useUnifiedNotifications } from '../../hooks/useUnifiedNotifications';
import { useMarkRead } from '../../hooks/useNotifications';
import { deleteAllNotifications } from '../../lib/api/notifications';
import { QUERY_KEYS } from '../../constants/queryKeys';
import { useAuthStore } from '../../stores/authStore';
import { useNotificationStore } from '../../stores/notificationStore';
import { theme } from '../../constants/theme';

export function NotificationsScreen() {
  const { t } = useTranslation();
  const profile = useAuthStore((s) => s.profile);
  const qc = useQueryClient();
  const userId = profile?.id ?? '';
  const {
    feed, isLoading, isRefetching, refetch,
    unreadTicketCount, unreadAnnouncementCount, markAllBroadcastsRead, markBroadcastRead,
  } = useUnifiedNotifications(userId, profile?.store_id ?? null);
  const { markOne, markAll } = useMarkRead(userId);

  const clearedAt = useNotificationStore((s) => s.alertsClearedAt);
  const setClearedAt = useNotificationStore((s) => s.setAlertsClearedAt);

  // Hide anything the user has already "cleared" (announcements can't be deleted
  // per-user, so we hide by timestamp instead). New items still come through.
  const displayFeed = useMemo(
    () => feed.filter((f) => new Date(f.created_at).getTime() > clearedAt),
    [feed, clearedAt],
  );

  const anyUnread = unreadTicketCount > 0 || unreadAnnouncementCount > 0;

  const markAllRead = () => {
    if (unreadTicketCount > 0) markAll.mutate();
    if (unreadAnnouncementCount > 0) markAllBroadcastsRead();
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

  const hasItems = displayFeed.length > 0;

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader
        title={t('tabs.alerts')}
        right={
          <View style={styles.headerRight}>
            {anyUnread && (
              <TouchableOpacity style={styles.markBtn} onPress={markAllRead} activeOpacity={0.85}>
                <Ionicons name="checkmark-done" size={13} color={theme.colors.accent} />
                <Text style={styles.markBtnText}>{t('common.markAllRead', { defaultValue: 'Mark all read' })}</Text>
              </TouchableOpacity>
            )}
            {hasItems && (
              <TouchableOpacity
                style={styles.clearBtn}
                onPress={() => clearAll.mutate()}
                disabled={clearAll.isPending}
                hitSlop={8}
              >
                <Ionicons name="trash-outline" size={16} color="#fff" />
              </TouchableOpacity>
            )}
            {profile ? <ProfileIconButton profile={profile} /> : null}
          </View>
        }
      />
      {isLoading ? (
        <LoadingOverlay />
      ) : (
        <FlatList
          data={displayFeed}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.itemWrap}>
              <UnifiedNotificationItem
                item={item}
                onMarkRead={(id) => markOne.mutate(id)}
                onReadAnnouncement={(id) => markBroadcastRead(id)}
              />
            </View>
          )}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
          ListEmptyComponent={<EmptyState icon="notifications-outline" title="No notifications yet" />}
        />
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
});
