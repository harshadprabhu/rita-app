import React, { useMemo } from 'react';
import { FlatList, View, Text, StyleSheet, RefreshControl, TouchableOpacity } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BroadcastForm } from '../../components/admin/BroadcastForm';
import { LoadingOverlay } from '../../components/common/LoadingOverlay';
import { EmptyState } from '../../components/common/EmptyState';
import { QUERY_KEYS } from '../../constants/queryKeys';
import { getBroadcasts, createBroadcast } from '../../lib/api/broadcasts';
import { getStores } from '../../lib/api/stores';
import { useAuthStore } from '../../stores/authStore';
import { useUiStore } from '../../stores/uiStore';
import { formatDateTime } from '../../lib/utils/date';
import { DbBroadcast } from '../../types';
import { theme } from '../../constants/theme';

// Managers broadcast to their own store only — the store picker is limited to it.
export default function ManagerBroadcasts() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const showToast = useUiStore((s) => s.showToast);
  const profile = useAuthStore((s) => s.profile);
  const insets = useSafeAreaInsets();

  const { data: broadcasts, isLoading, refetch, isRefetching } = useQuery({
    queryKey: QUERY_KEYS.broadcasts(),
    queryFn: getBroadcasts,
  });
  const { data: allStores } = useQuery({ queryKey: QUERY_KEYS.stores(), queryFn: getStores });
  const stores = useMemo(
    () => (allStores ?? []).filter((s) => s.id === profile?.store_id),
    [allStores, profile?.store_id],
  );

  const sendMutation = useMutation({
    mutationFn: (payload: { title: string; body: string; target_store_ids: string[] }) =>
      createBroadcast({
        ...payload,
        // Default to the manager's store if they didn't explicitly target it.
        target_store_ids: payload.target_store_ids.length ? payload.target_store_ids : (profile?.store_id ? [profile.store_id] : []),
        sender_id: profile!.id,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.broadcasts() });
      showToast(t('broadcasts.sentToast'), 'success');
    },
    onError: () => showToast(t('broadcasts.sendFailed'), 'error'),
  });

  if (isLoading) return <LoadingOverlay />;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + theme.spacing.sm }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <Ionicons name="chevron-back" size={22} color="rgba(255,255,255,0.8)" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer} pointerEvents="none">
          <Text style={styles.headerTitle}>{t('broadcasts.title')}</Text>
        </View>
        <View style={styles.headerRight} />
      </View>

      <FlatList
        data={broadcasts ?? []}
        keyExtractor={(b) => b.id}
        renderItem={({ item }: { item: DbBroadcast }) => (
          <View style={[styles.card, theme.shadows.sm]}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardBody}>{item.body}</Text>
            <Text style={styles.cardMeta}>{formatDateTime(item.created_at)}</Text>
          </View>
        )}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.colors.brand} colors={[theme.colors.brand]} />}
        ListHeaderComponent={
          <>
            <BroadcastForm stores={stores} onSubmit={(p) => sendMutation.mutate(p)} isLoading={sendMutation.isPending} />
            {(broadcasts?.length ?? 0) > 0 && <Text style={styles.sectionTitle}>{t('broadcasts.pastBroadcasts')}</Text>}
          </>
        }
        ListEmptyComponent={broadcasts !== undefined ? <EmptyState icon="megaphone-outline" title={t('broadcasts.emptyTitle')} /> : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  header: {
    backgroundColor: theme.colors.brand, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: theme.spacing.sm, paddingBottom: theme.spacing.md,
  },
  backBtn: { padding: theme.spacing.sm },
  headerTitleContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  headerRight: { width: 38 },
  list: { paddingTop: theme.spacing.lg, paddingBottom: theme.spacing.lg * 2 },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: theme.colors.textTertiary, letterSpacing: 0.8,
    textTransform: 'uppercase', marginHorizontal: theme.spacing.lg, marginBottom: theme.spacing.sm,
  },
  card: {
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1,
    borderColor: theme.colors.border, padding: theme.spacing.md, marginHorizontal: theme.spacing.lg, marginBottom: theme.spacing.sm,
  },
  cardTitle: { fontWeight: '700', color: theme.colors.textPrimary, fontSize: 14, marginBottom: theme.spacing.xs },
  cardBody: { color: theme.colors.textSecondary, fontSize: 13, marginBottom: theme.spacing.xs },
  cardMeta: { color: theme.colors.textTertiary, fontSize: 12 },
});
