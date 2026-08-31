import React from 'react';
import { FlatList, RefreshControl, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/common/Screen';
import { AppHeader } from '../../components/common/AppHeader';
import { ProfileIconButton } from '../../components/common/ProfileIconButton';
import { EmptyState } from '../../components/common/EmptyState';
import { LoadingOverlay } from '../../components/common/LoadingOverlay';
import { LifecycleChip } from '../../components/common/StatusChip';
import { PriorityBadge } from '../../components/common/PriorityBadge';
import { NumericText } from '../../components/common/NumericText';
import { SoftPress } from '../../components/common/SoftPress';
import { getOpenTickets, claimTicket, getTicketCount } from '../../lib/api/tickets';
import { useAuthStore } from '../../stores/authStore';
import { QUERY_KEYS } from '../../constants/queryKeys';
import { theme } from '../../constants/theme';
import { showAlert } from '../../lib/utils/alert';

export default function TechnicianQueue() {
  const profile = useAuthStore((s) => s.profile);
  const queryClient = useQueryClient();
  const { data: tickets, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['open-tickets'],
    queryFn: getOpenTickets,
  });
  const unassigned = (tickets ?? []).filter((t) => !t.assignee_id);

  // "In Progress" tile — every role gets one on Home; this screen has no
  // stat-tile row like the others, so it's added standalone here scoped to
  // the technician's own assigned work (the metric that's actually
  // actionable for them, unlike the unassigned queue below).
  const inProgressFilters = { assignee_id: profile?.id, status: 'in_progress' as const };
  const { data: inProgressCount } = useQuery({
    queryKey: QUERY_KEYS.ticketCount(inProgressFilters),
    queryFn: () => getTicketCount(inProgressFilters),
    enabled: !!profile?.id,
  });

  const claim = useMutation({
    mutationFn: (ticketId: string) => claimTicket(ticketId, profile!.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['open-tickets'] }),
    onError: (e) => {
      // claimTicket only updates a still-unassigned row — if another
      // technician claimed it first, this throws (0 rows matched) with no
      // prior feedback of any kind. Surface it and refresh so the (now
      // stale) row disappears from this technician's queue.
      showAlert('Could not claim ticket', 'Someone else may have already claimed it. The queue will refresh.');
      queryClient.invalidateQueries({ queryKey: ['open-tickets'] });
    },
  });

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader title="Open Queue" right={profile ? <ProfileIconButton profile={profile} /> : null} />
      <SoftPress
        style={[styles.inProgressTile, theme.shadows.xs]}
        onPress={() => router.push({ pathname: '/(technician)/my-tickets', params: { status: 'in_progress' } })}
      >
        <View style={[styles.inProgressIcon, { backgroundColor: '#F59E0B' + '1F' }]}>
          <Ionicons name="sync-outline" size={15} color="#F59E0B" />
        </View>
        <View style={{ flex: 1 }}>
          <NumericText style={styles.inProgressValue}>{inProgressCount ?? '–'}</NumericText>
          <Text style={styles.inProgressLabel}>In Progress (mine)</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
      </SoftPress>
      {isLoading ? (
        <LoadingOverlay />
      ) : (
        <FlatList
          data={unassigned}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
          renderItem={({ item }) => (
            <View style={[styles.card, theme.shadows.sm]}>
              <View style={styles.topRow}>
                <PriorityBadge priority={item.priority} />
                <Text style={styles.ticketNumber}>{item.sampark_display_id ? `#${item.sampark_display_id}` : 'Sync pending'}</Text>
                <LifecycleChip lifecycle={item.lifecycle} small />
              </View>
              <Text style={styles.description} numberOfLines={2}>{item.description}</Text>
              <Text style={styles.store}>{item.store?.name}</Text>
              <TouchableOpacity style={styles.claimBtn} onPress={() => claim.mutate(item.id)} disabled={claim.isPending}>
                <Text style={styles.claimBtnText}>Claim ticket</Text>
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={<EmptyState icon="checkmark-done-outline" title="Queue is clear" subtitle="No unassigned tickets right now" />}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: theme.spacing.lg, gap: theme.spacing.md },
  inProgressTile: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg,
    borderWidth: 1, borderColor: theme.colors.border,
    marginHorizontal: theme.spacing.lg, marginTop: theme.spacing.sm, marginBottom: theme.spacing.xs,
    paddingVertical: 13, paddingHorizontal: theme.spacing.md,
  },
  inProgressIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  inProgressValue: { fontSize: 22, fontWeight: '800', color: theme.colors.textPrimary, letterSpacing: 0.2 },
  inProgressLabel: { fontSize: 10.5, color: theme.colors.textSecondary, fontWeight: '600', marginTop: 1 },
  card: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: theme.spacing.md, marginBottom: theme.spacing.md },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginBottom: theme.spacing.sm },
  ticketNumber: { flex: 1, fontWeight: '600', fontSize: 13, color: theme.colors.brand },
  description: { fontSize: 14, color: theme.colors.textPrimary, marginBottom: theme.spacing.xs },
  store: { fontSize: 12, color: theme.colors.textTertiary, marginBottom: theme.spacing.md },
  claimBtn: { backgroundColor: theme.colors.brand, borderRadius: theme.radius.sm, paddingVertical: theme.spacing.sm, alignItems: 'center' },
  claimBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
