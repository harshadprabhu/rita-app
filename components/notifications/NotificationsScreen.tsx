import React, { useEffect } from 'react';
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
import { theme } from '../../constants/theme';

export function NotificationsScreen() {
  const { t } = useTranslation();
  const profile = useAuthStore((s) => s.profile);
  const qc = useQueryClient();
  const userId = profile?.id ?? '';
  const {
    feed, isLoading, isRefetching, refetch,
    unreadTicketCount, unreadAnnouncementCount, markAllBroadcastsRead,
  } = useUnifiedNotifications(userId, profile?.store_id ?? null);
  const { markOne, markAll } = useMarkRead(userId);

  // Opening the Alerts inbox clears the unread badge: mark ticket alerts and
  // announcements read once they've been surfaced here.
  useEffect(() => {
    if (!userId) return;
    if (unreadTicketCount > 0) markAll.mutate();
    if (unreadAnnouncementCount > 0) markAllBroadcastsRead();
  }, [userId, unreadTicketCount, unreadAnnouncementCount]);

  const clearAll = useMutation({
    mutationFn: async () => {
      await deleteAllNotifications(userId);
      await markAllBroadcastsRead();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.notifications(userId) });
      refetch();
    },
  });

  const hasItems = feed.length > 0;

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader
        title={t('tabs.alerts')}
        right={
          <View style={styles.headerRight}>
            {hasItems && (
              <TouchableOpacity
                style={styles.clearBtn}
                onPress={() => clearAll.mutate()}
                disabled={clearAll.isPending}
              >
                <Ionicons name="trash-outline" size={13} color="#fff" />
                <Text style={styles.clearBtnText}>{t('common.clearAll')}</Text>
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
          data={feed}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.itemWrap}>
              <UnifiedNotificationItem item={item} onMarkRead={(id) => markOne.mutate(id)} />
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
  clearBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.xs,
  },
  clearBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
