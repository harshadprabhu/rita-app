import React, { useEffect } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Screen } from '../common/Screen';
import { AppHeader } from '../common/AppHeader';
import { ProfileIconButton } from '../common/ProfileIconButton';
import { EmptyState } from '../common/EmptyState';
import { LoadingOverlay } from '../common/LoadingOverlay';
import { UnifiedNotificationItem } from './UnifiedNotificationItem';
import { useUnifiedNotifications } from '../../hooks/useUnifiedNotifications';
import { useMarkRead } from '../../hooks/useNotifications';
import { useAuthStore } from '../../stores/authStore';
import { theme } from '../../constants/theme';

export function NotificationsScreen() {
  const { t } = useTranslation();
  const profile = useAuthStore((s) => s.profile);
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

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader title={t('tabs.alerts')} right={profile ? <ProfileIconButton profile={profile} /> : null} />
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
});
