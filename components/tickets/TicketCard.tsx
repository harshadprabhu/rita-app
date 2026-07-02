import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
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
    <TouchableOpacity onPress={() => router.push(`/tickets/${ticket.id}`)} activeOpacity={0.7}>
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
            <View style={styles.timeRow}>
              <Ionicons name="time-outline" size={12} color={theme.colors.textTertiary} />
              <Text style={styles.timeAgo}>{timeAgo(ticket.created_at)}</Text>
            </View>
            {ticket.sla_breached && (
              <View style={styles.slaBadge}>
                <Ionicons name="alert" size={11} color={theme.priorityColors.high} />
                <Text style={styles.slaBreach}>SLA breached</Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: theme.radius.lg, marginHorizontal: theme.spacing.lg, marginVertical: 6 },
  inner: {
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, marginLeft: 4,
    padding: theme.spacing.md + 2, borderWidth: 1, borderColor: theme.colors.border, borderLeftWidth: 0,
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.sm },
  left: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  ticketNumber: { fontWeight: '700', fontSize: 13, color: theme.colors.brand, letterSpacing: 0.2 },
  description: { fontWeight: '500', fontSize: 14, color: theme.colors.textPrimary, lineHeight: 20, marginBottom: theme.spacing.sm },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timeAgo: { fontSize: 12, color: theme.colors.textTertiary, fontWeight: '500' },
  slaBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: theme.colors.errorBg, paddingHorizontal: theme.spacing.sm, paddingVertical: 3,
    borderRadius: theme.radius.full,
  },
  slaBreach: { fontSize: 10, fontWeight: '700', color: theme.priorityColors.high },
});
