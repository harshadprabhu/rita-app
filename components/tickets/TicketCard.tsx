import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TicketWithRelations } from '../../types/ticket';
import { LifecycleChip } from '../common/StatusChip';
import { PriorityBadge } from '../common/PriorityBadge';
import { timeAgo } from '../../lib/utils/date';
import { theme } from '../../constants/theme';

interface Props {
  ticket: TicketWithRelations;
}

export function TicketCard({ ticket }: Props) {
  useTranslation();
  const statusColor = theme.statusColors[ticket.status].accent;

  return (
    <TouchableOpacity onPress={() => router.push(`/tickets/${ticket.id}`)}>
      <View style={[styles.card, theme.shadows.sm, { backgroundColor: statusColor }]}>
        <View style={styles.inner}>
          <View style={styles.topRow}>
            <View style={styles.left}>
              <PriorityBadge priority={ticket.priority} />
              <Text style={styles.ticketNumber}>{ticket.ticket_number}</Text>
            </View>
            <LifecycleChip lifecycle={ticket.lifecycle} />
          </View>

          <Text style={styles.description} numberOfLines={2}>{ticket.description}</Text>

          <View style={styles.bottomRow}>
            <Text style={styles.timeAgo}>{timeAgo(ticket.created_at)}</Text>
            {ticket.sla_breached && <Text style={styles.slaBreach}>SLA breached</Text>}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: theme.radius.md, marginHorizontal: theme.spacing.lg, marginVertical: 6 },
  inner: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, marginLeft: 4, padding: theme.spacing.md },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.sm },
  left: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  ticketNumber: { fontWeight: '600', fontSize: 13, color: theme.colors.brand },
  description: { fontWeight: '500', fontSize: 14, color: theme.colors.textPrimary, marginBottom: theme.spacing.sm },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  timeAgo: { fontSize: 12, color: theme.colors.textTertiary },
  slaBreach: { fontSize: 11, fontWeight: '700', color: theme.priorityColors.high },
});
