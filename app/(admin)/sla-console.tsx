import React from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/common/Screen';
import { AppHeader } from '../../components/common/AppHeader';
import { EmptyState } from '../../components/common/EmptyState';
import { LoadingOverlay } from '../../components/common/LoadingOverlay';
import { PriorityBadge } from '../../components/common/PriorityBadge';
import { getBreachedTickets } from '../../lib/api/sla';
import { exportTicketsToPdf, exportTicketsToSpreadsheet } from '../../lib/utils/export';
import { QUERY_KEYS } from '../../constants/queryKeys';
import { theme } from '../../constants/theme';

export default function SlaConsole() {
  const { data: tickets, isLoading, refetch, isRefetching } = useQuery({
    queryKey: QUERY_KEYS.slaBreaches(),
    queryFn: getBreachedTickets,
  });

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader
        title="SLA Breach Console"
        right={
          <View style={styles.exportRow}>
            <TouchableOpacity onPress={() => tickets?.length && exportTicketsToPdf(tickets)} style={styles.exportBtn}>
              <Ionicons name="document-text-outline" size={20} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => tickets?.length && exportTicketsToSpreadsheet(tickets)} style={styles.exportBtn}>
              <Ionicons name="grid-outline" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        }
      />
      {isLoading ? (
        <LoadingOverlay />
      ) : (
        <FlatList
          data={tickets ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
          renderItem={({ item }) => (
            <View style={[styles.card, theme.shadows.sm]}>
              <View style={styles.topRow}>
                <PriorityBadge priority={item.priority} />
                <Text style={styles.ticketNumber}>{item.ticket_number}</Text>
                <Text style={styles.breachBadge}>SLA BREACHED</Text>
              </View>
              <Text style={styles.description} numberOfLines={2}>{item.description}</Text>
              <Text style={styles.meta}>{item.store?.name} · Assignee: {item.assignee?.display_name ?? 'Unassigned'}</Text>
              <TouchableOpacity
                style={styles.reassignBtn}
                onPress={() => Alert.alert('Reassign', `Reassigning ${item.ticket_number} — open ticket detail to pick a technician.`)}
              >
                <Text style={styles.reassignBtnText}>Reassign</Text>
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={<EmptyState icon="shield-checkmark-outline" title="No SLA breaches" subtitle="All tickets are within SLA" />}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: theme.spacing.lg },
  exportRow: { flexDirection: 'row', gap: theme.spacing.sm },
  exportBtn: { padding: theme.spacing.xs },
  card: {
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, padding: theme.spacing.md + 2,
    marginBottom: theme.spacing.md, borderLeftWidth: 4, borderLeftColor: theme.priorityColors.critical,
    borderWidth: 1, borderColor: theme.colors.border, ...theme.shadows.xs,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginBottom: theme.spacing.sm },
  ticketNumber: { flex: 1, fontWeight: '700', fontSize: 13, color: theme.colors.brand },
  breachBadge: {
    fontSize: 10, fontWeight: '800', color: theme.priorityColors.critical, letterSpacing: 0.3,
    backgroundColor: theme.priorityColors.critical + '1A', paddingHorizontal: theme.spacing.sm, paddingVertical: 3,
    borderRadius: theme.radius.full,
  },
  description: { fontSize: 14, color: theme.colors.textPrimary, marginBottom: theme.spacing.xs, lineHeight: 20 },
  meta: { fontSize: 12, color: theme.colors.textTertiary, marginBottom: theme.spacing.md },
  reassignBtn: { alignSelf: 'flex-start', backgroundColor: theme.colors.surface2, borderRadius: theme.radius.md, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm },
  reassignBtnText: { color: theme.colors.brand, fontWeight: '700', fontSize: 12 },
});
