import React from 'react';
import { FlatList, View, Text, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TechnicianApprovalCard } from '../../components/admin/TechnicianApprovalCard';
import { EmptyState } from '../../components/common/EmptyState';
import { LoadingOverlay } from '../../components/common/LoadingOverlay';
import { QUERY_KEYS } from '../../constants/queryKeys';
import { getPendingTechnicians, updateApprovalStatus } from '../../lib/api/profiles';
import { createNotification } from '../../lib/api/notifications';
import { useUiStore } from '../../stores/uiStore';
import { theme } from '../../constants/theme';

export default function AdminApprovals() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const showToast = useUiStore((s) => s.showToast);
  const insets = useSafeAreaInsets();
  const { data: pending, isLoading, refetch } = useQuery({
    queryKey: QUERY_KEYS.pendingTechnicians(),
    queryFn: getPendingTechnicians,
  });

  const approveMutation = useMutation({
    mutationFn: async (techId: string) => {
      await updateApprovalStatus(techId, 'approved');
      // Fire notification best-effort — a notification failure must not
      // roll back the approval or surface a misleading error to the admin.
      createNotification({
        recipient_id: techId,
        title: t('notify.accountApprovedTitle'),
        body: t('notify.accountApprovedBody'),
        type: 'ticket_updated',
      }).catch((err) => console.error('[approvals] approve notification failed:', err));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.pendingTechnicians() });
      showToast(t('approvals.approvedToast'), 'success');
    },
    onError: () => showToast(t('approvals.approveFailed'), 'error'),
  });

  const rejectMutation = useMutation({
    mutationFn: async (techId: string) => {
      await updateApprovalStatus(techId, 'rejected');
      // Fire notification best-effort — same rationale as above.
      createNotification({
        recipient_id: techId,
        title: t('notify.accountRejectedTitle'),
        body: t('notify.accountRejectedBody'),
        type: 'ticket_updated',
      }).catch((err) => console.error('[approvals] reject notification failed:', err));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.pendingTechnicians() });
      showToast(t('approvals.rejectedToast'), 'info');
    },
    onError: () => showToast(t('approvals.rejectFailed'), 'error'),
  });

  if (isLoading) return <LoadingOverlay />;

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + theme.spacing.sm }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <Ionicons name="chevron-back" size={22} color="rgba(255,255,255,0.8)" />
        </TouchableOpacity>
        <View style={[StyleSheet.absoluteFillObject, { paddingTop: insets.top + theme.spacing.sm, paddingBottom: theme.spacing.md }]} pointerEvents="none">
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>{t('approvals.title')}</Text>
          </View>
        </View>
        <View style={styles.headerRight} />
      </View>

      <FlatList
        data={pending ?? []}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => (
          <TechnicianApprovalCard
            profile={item}
            onApprove={(id) => approveMutation.mutate(id)}
            onReject={(id) => rejectMutation.mutate(id)}
            isLoading={approveMutation.isPending || rejectMutation.isPending}
          />
        )}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={refetch}
            tintColor={theme.colors.brand}
            colors={[theme.colors.brand]}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon="checkmark-circle-outline"
            title={t('approvals.emptyTitle')}
            subtitle={t('approvals.emptySubtitle')}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  header: {
    backgroundColor: theme.colors.brand,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
  },
  backBtn: {
    padding: theme.spacing.sm,
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  headerRight: {
    width: 38, // mirrors backBtn: padding(8) + icon(22) + padding(8)
  },
  list: {
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.xxl,
  },
});
