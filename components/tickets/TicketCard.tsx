import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, Alert, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { TicketWithRelations } from '../../types/ticket';
import { LifecycleChip } from '../common/StatusChip';
import { PriorityBadge } from '../common/PriorityBadge';
import { timeAgo } from '../../lib/utils/date';
import { useAuthStore } from '../../stores/authStore';
import { getTechnicians } from '../../lib/api/profiles';
import { updateTicket, reassignTicket, deleteTicket } from '../../lib/api/tickets';
import { QUERY_KEYS } from '../../constants/queryKeys';
import { theme } from '../../constants/theme';

interface Props {
  ticket: TicketWithRelations;
}

export function TicketCard({ ticket }: Props) {
  const { t } = useTranslation();
  const profile = useAuthStore((s) => s.profile);
  const qc = useQueryClient();
  const statusColor = theme.statusColors[ticket.status].accent;

  // Row actions (Resolve / Reassign / Delete) are available to technicians and admins only.
  const canAct = profile?.role === 'technician' || profile?.role === 'admin';
  const [menuOpen, setMenuOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);

  const { data: technicians } = useQuery({
    queryKey: QUERY_KEYS.technicians(),
    queryFn: getTechnicians,
    enabled: reassignOpen,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: QUERY_KEYS.tickets() });
    qc.invalidateQueries({ queryKey: QUERY_KEYS.ticket(ticket.id) });
  };
  const closeMenu = () => { setMenuOpen(false); setReassignOpen(false); };

  const resolveM = useMutation({
    mutationFn: () => updateTicket(ticket.id, { status: 'resolved', lifecycle: 'resolved' }, profile?.id),
    onSuccess: () => { invalidate(); closeMenu(); },
  });
  const reassignM = useMutation({
    mutationFn: (techId: string) => reassignTicket(ticket.id, techId, profile!.id),
    onSuccess: () => { invalidate(); closeMenu(); },
  });
  const deleteM = useMutation({
    mutationFn: () => deleteTicket(ticket.id),
    onSuccess: () => { invalidate(); closeMenu(); },
  });

  const confirmDelete = () => {
    Alert.alert('Delete ticket', `Delete ${ticket.ticket_number}? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteM.mutate() },
    ]);
  };

  const categoryLabel = ticket.category ? t(`category.${ticket.category}`) : null;

  return (
    <View style={[styles.card, theme.shadows.sm, { backgroundColor: statusColor }]}>
      <TouchableOpacity onPress={() => router.push(`/tickets/${ticket.id}`)} activeOpacity={0.7}>
        <View style={styles.inner}>
          <View style={styles.topRow}>
            <View style={styles.left}>
              <PriorityBadge priority={ticket.priority} />
              <Text style={styles.ticketNumber}>{ticket.sampark_display_id ? `#${ticket.sampark_display_id}` : ticket.ticket_number}</Text>
            </View>
            <View style={styles.rightRow}>
              <LifecycleChip lifecycle={ticket.lifecycle} />
              {canAct && (
                <TouchableOpacity
                  onPress={() => { setMenuOpen((v) => !v); setReassignOpen(false); }}
                  hitSlop={8}
                  style={styles.menuBtn}
                >
                  <Ionicons name="ellipsis-vertical" size={16} color={theme.colors.textTertiary} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          <Text style={styles.description} numberOfLines={2}>{ticket.description}</Text>

          {/* Meta: category + assignee */}
          <View style={styles.metaRow}>
            {categoryLabel && (
              <View style={styles.tag}>
                <Ionicons name="pricetag-outline" size={11} color={theme.colors.brand} />
                <Text style={styles.tagText} numberOfLines={1}>{categoryLabel}</Text>
              </View>
            )}
            <View style={styles.tag}>
              <Ionicons name="person-outline" size={11} color={theme.colors.textTertiary} />
              <Text style={styles.assigneeText} numberOfLines={1}>
                {ticket.assignee?.display_name ?? 'Unassigned'}
              </Text>
            </View>
          </View>

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
      </TouchableOpacity>

      {/* Action menu overlay */}
      {canAct && menuOpen && (
        <View style={styles.menu}>
          {!reassignOpen ? (
            <>
              <MenuItem icon="checkmark-circle-outline" color={theme.statusColors.resolved.text} label="Resolve" onPress={() => resolveM.mutate()} busy={resolveM.isPending} />
              <MenuItem icon="people-outline" color={theme.colors.brand} label="Reassign" onPress={() => setReassignOpen(true)} />
              <MenuItem icon="trash-outline" color={theme.colors.errorStrong} label="Delete" onPress={confirmDelete} busy={deleteM.isPending} />
            </>
          ) : (
            <View style={styles.techList}>
              <View style={styles.techHeader}>
                <Text style={styles.techHeaderText}>Reassign to</Text>
                <TouchableOpacity onPress={() => setReassignOpen(false)}><Text style={styles.techBack}>Back</Text></TouchableOpacity>
              </View>
              {(technicians ?? []).length === 0 ? (
                <Text style={styles.techEmpty}>No approved technicians</Text>
              ) : (
                (technicians ?? []).map((tech) => (
                  <TouchableOpacity key={tech.id} style={styles.techRow} onPress={() => reassignM.mutate(tech.id)} disabled={reassignM.isPending}>
                    <Text style={styles.techName}>{tech.display_name}</Text>
                    <Text style={styles.techDept}>{tech.designation ?? 'Technician'}</Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function MenuItem({ icon, color, label, onPress, busy }: { icon: keyof typeof Ionicons.glyphMap; color: string; label: string; onPress: () => void; busy?: boolean }) {
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress} disabled={busy}>
      {busy ? <ActivityIndicator size="small" color={color} /> : <Ionicons name={icon} size={16} color={color} />}
      <Text style={[styles.menuItemText, { color }]}>{label}</Text>
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
  rightRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  menuBtn: { padding: 2 },
  ticketNumber: { fontWeight: '700', fontSize: 13, color: theme.colors.brand, letterSpacing: 0.2 },
  description: { fontWeight: '500', fontSize: 14, color: theme.colors.textPrimary, lineHeight: 20, marginBottom: theme.spacing.sm },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginBottom: theme.spacing.sm },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '60%' },
  tagText: { fontSize: 11, fontWeight: '700', color: theme.colors.brand },
  assigneeText: { fontSize: 11, fontWeight: '600', color: theme.colors.textSecondary },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timeAgo: { fontSize: 12, color: theme.colors.textTertiary, fontWeight: '500' },
  slaBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: theme.colors.errorBg, paddingHorizontal: theme.spacing.sm, paddingVertical: 3,
    borderRadius: theme.radius.full,
  },
  slaBreach: { fontSize: 10, fontWeight: '700', color: theme.priorityColors.high },
  // Action menu
  menu: {
    position: 'absolute', top: 40, right: theme.spacing.md, zIndex: 20,
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border,
    paddingVertical: theme.spacing.xs, minWidth: 190, ...theme.shadows.lg,
  },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm },
  menuItemText: { fontSize: 13, fontWeight: '700' },
  techList: { paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs, maxHeight: 220 },
  techHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: theme.spacing.sm, paddingBottom: theme.spacing.xs, borderBottomWidth: 1, borderBottomColor: theme.colors.border, marginBottom: theme.spacing.xs },
  techHeaderText: { fontSize: 10, fontWeight: '800', color: theme.colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 },
  techBack: { fontSize: 11, fontWeight: '800', color: theme.colors.brand },
  techEmpty: { fontSize: 11, color: theme.colors.textTertiary, fontStyle: 'italic', padding: theme.spacing.sm },
  techRow: { paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.sm, borderRadius: theme.radius.sm },
  techName: { fontSize: 13, fontWeight: '700', color: theme.colors.textPrimary },
  techDept: { fontSize: 10, color: theme.colors.textTertiary, marginTop: 1 },
});
