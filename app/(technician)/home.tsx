import React from 'react';
import { FlatList, RefreshControl, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Screen } from '../../components/common/Screen';
import { AppHeader } from '../../components/common/AppHeader';
import { ProfileIconButton } from '../../components/common/ProfileIconButton';
import { EmptyState } from '../../components/common/EmptyState';
import { LoadingOverlay } from '../../components/common/LoadingOverlay';
import { LifecycleChip } from '../../components/common/StatusChip';
import { PriorityBadge } from '../../components/common/PriorityBadge';
import { getOpenTickets, claimTicket } from '../../lib/api/tickets';
import { useAuthStore } from '../../stores/authStore';
import { theme } from '../../constants/theme';

export default function TechnicianQueue() {
  const profile = useAuthStore((s) => s.profile);
  const queryClient = useQueryClient();
  const { data: tickets, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['open-tickets'],
    queryFn: getOpenTickets,
  });
  const unassigned = (tickets ?? []).filter((t) => !t.assignee_id);

  const claim = useMutation({
    mutationFn: (ticketId: string) => claimTicket(ticketId, profile!.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['open-tickets'] }),
  });

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader title="Open Queue" right={profile ? <ProfileIconButton profile={profile} /> : null} />
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
                <Text style={styles.ticketNumber}>{item.ticket_number}</Text>
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
  card: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: theme.spacing.md, marginBottom: theme.spacing.md },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginBottom: theme.spacing.sm },
  ticketNumber: { flex: 1, fontWeight: '600', fontSize: 13, color: theme.colors.brand },
  description: { fontSize: 14, color: theme.colors.textPrimary, marginBottom: theme.spacing.xs },
  store: { fontSize: 12, color: theme.colors.textTertiary, marginBottom: theme.spacing.md },
  claimBtn: { backgroundColor: theme.colors.brand, borderRadius: theme.radius.sm, paddingVertical: theme.spacing.sm, alignItems: 'center' },
  claimBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
