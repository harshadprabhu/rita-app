import React from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Screen } from '../common/Screen';
import { AppHeader } from '../common/AppHeader';
import { ProfileIconButton } from '../common/ProfileIconButton';
import { EmptyState } from '../common/EmptyState';
import { LoadingOverlay } from '../common/LoadingOverlay';
import { NotificationItem } from './NotificationItem';
import { getNotifications, markNotificationRead } from '../../lib/api/notifications';
import { useAuthStore } from '../../stores/authStore';
import { QUERY_KEYS } from '../../constants/queryKeys';
import { theme } from '../../constants/theme';

export function NotificationsScreen() {
  const { t } = useTranslation();
  const profile = useAuthStore((s) => s.profile);
  const queryClient = useQueryClient();
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: QUERY_KEYS.notifications(profile?.id ?? ''),
    queryFn: () => getNotifications(profile!.id),
    enabled: !!profile,
  });

  const markRead = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.notifications(profile?.id ?? '') }),
  });

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader title={t('tabs.alerts')} right={profile ? <ProfileIconButton profile={profile} /> : null} />
      {isLoading ? (
        <LoadingOverlay />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.itemWrap}>
              <NotificationItem notification={item} onRead={(id) => markRead.mutate(id)} />
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
