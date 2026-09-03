import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { TicketWithRelations } from '../../types/ticket';
import { LifecycleChip } from '../common/StatusChip';
import { timeAgo, formatDurationBetween } from '../../lib/utils/date';
import { useAuthStore } from '../../stores/authStore';
import { getTechnicians } from '../../lib/api/profiles';
import { updateTicket, reassignTicket, deleteTicket, getTicketById } from '../../lib/api/tickets';
import { getSamparkNotes } from '../../lib/api/samparkComments';
import { QUERY_KEYS } from '../../constants/queryKeys';
import { theme } from '../../constants/theme';
import { NumericText } from '../common/NumericText';
import { showAlert } from '../../lib/utils/alert';

interface Props {
  ticket: TicketWithRelations;
  /** Whether THIS card's action menu is the one currently open — lifted to the
   * list screen so opening one ticket's menu closes any other that was open,
   * instead of each card tracking its own independent open/closed state. */
  menuOpen: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
}

export function TicketCard({ ticket, menuOpen, onToggleMenu, onCloseMenu }: Props) {
  const { t } = useTranslation();
  const profile = useAuthStore((s) => s.profile);
  const qc = useQueryClient();
  const statusColor = theme.statusColors[ticket.status].accent;

  // Row actions (Resolve / Reassign / Delete) are available to technicians and admins only.
  const canAct = profile?.role === 'technician' || profile?.role === 'admin';
  const [reassignOpen, setReassignOpen] = useState(false);
  // The reassign sub-panel should reset whenever this card's menu closes,
  // whether that's from an action completing or another ticket's menu opening.
  React.useEffect(() => { if (!menuOpen) setReassignOpen(false); }, [menuOpen]);

  const { data: technicians } = useQuery({
    queryKey: QUERY_KEYS.technicians(),
    queryFn: getTechnicians,
    enabled: reassignOpen,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: QUERY_KEYS.tickets() });
    qc.invalidateQueries({ queryKey: QUERY_KEYS.ticket(ticket.id) });
  };
  const closeMenu = () => { onCloseMenu(); setReassignOpen(false); };

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
    onSuccess: () => {
      invalidate();
      closeMenu();
      // A successful delete used to be visually indistinguishable from a
      // silently-failed one — the row just vanished (or didn't) with no
      // feedback either way. Explicit confirmation removes that ambiguity.
      showAlert('Ticket deleted', 'The ticket was permanently removed.');
    },
    onError: (err: Error) => {
      closeMenu();
      showAlert('Delete failed', err.message ?? 'Unknown error');
    },
  });

  const confirmDelete = () => {
    showAlert('Delete ticket', `Delete ${ticket.sampark_display_id ? `#${ticket.sampark_display_id}` : 'this ticket'}? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteM.mutate() },
    ]);
  };

  // Categories are dynamic Sampark taxonomy values, not a fixed translated
  // set — running them through t() just prints the raw key (e.g.
  // "category.MTO Request") when no translation exists. Show as-is.
  const categoryLabel = ticket.category ?? null;
  const priorityColor = theme.priorityColors[ticket.priority];

  return (
    <View style={[styles.card, theme.shadows.sm, menuOpen && styles.cardMenuOpen]}>
      <TouchableOpacity
        onPress={() => {
          // Fire ticket + Sampark-notes fetches BEFORE navigating so the detail
          // screen usually mounts with data already in cache. Without this the
          // user watches an empty chat pane for the 0.5-1s the Sampark round
          // trip takes. prefetchQuery is a no-op if data is already fresh.
          qc.prefetchQuery({
            queryKey: QUERY_KEYS.ticket(ticket.id),
            queryFn: () => getTicketById(ticket.id),
            staleTime: 15 * 1000,
          });
          qc.prefetchQuery({
            queryKey: ['sampark-notes', ticket.id],
            queryFn: () => getSamparkNotes(ticket.id),
            staleTime: 5 * 1000,
          });
          router.push(`/tickets/${ticket.id}`);
        }}
        activeOpacity={0.7}
      >
        {/* Colored top strip driven by status — turns each row into a "tile"
          * visually consistent with the Home stat tiles (Open blue / In
          * Progress amber / Resolved green), so at a glance the status is the
          * first thing the eye lands on. */}
        <View style={[styles.tileTop, { backgroundColor: statusColor }]} />
        <View style={styles.inner}>
          {/* Row 1: title · priority pill · menu */}
          <View style={styles.topRow}>
            <Text style={styles.title} numberOfLines={2}>{ticket.description}</Text>
            <View style={styles.rightCol}>
              <View style={[styles.priorityPill, { backgroundColor: priorityColor + '14' }]}>
                <Text style={[styles.priorityText, { color: priorityColor }]}>{ticket.priority}</Text>
              </View>
              {canAct && (
                <TouchableOpacity
                  onPress={onToggleMenu}
                  hitSlop={8}
                  style={styles.menuBtn}
                >
                  <Ionicons name="ellipsis-vertical" size={15} color={theme.colors.textTertiary} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Row 2: lifecycle pill · id · category ........ time */}
          <View style={styles.metaRow}>
            <LifecycleChip lifecycle={ticket.lifecycle} small />
            <NumericText style={styles.ticketNumber} numberOfLines={1}>
              {ticket.sampark_display_id ? `#${ticket.sampark_display_id}` : 'Sync pending'}
            </NumericText>
            {categoryLabel && <Text style={styles.metaDot}>·</Text>}
            {categoryLabel && <Text style={styles.metaText} numberOfLines={1}>{categoryLabel}</Text>}
            <View style={{ flex: 1 }} />
            {ticket.status === 'resolved' && ticket.resolved_at ? (
              <View style={styles.resolvedBadge}>
                <Ionicons name="checkmark-done" size={10} color={theme.statusColors.resolved.text} />
                <Text style={styles.resolvedText}>{formatDurationBetween(ticket.created_at, ticket.resolved_at)}</Text>
              </View>
            ) : ticket.sla_breached ? (
              <View style={styles.slaBadge}>
                <Ionicons name="alert" size={10} color={theme.priorityColors.high} />
                <Text style={styles.slaBreach}>SLA</Text>
              </View>
            ) : (
              <Text style={styles.timeAgo}>{timeAgo(ticket.created_at)}</Text>
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
  card: {
    borderRadius: 16, marginHorizontal: theme.spacing.lg, marginVertical: 6,
    // Card owns the rounded outer clip + border so the colored tile strip
    // above tucks under the same corner radius as the body below.
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  // FlatList paints each row over the previous one in list order, so a
  // card's absolutely-positioned menu (below) was getting covered by the
  // NEXT card in the list, which has no zIndex/elevation of its own to lose
  // to. Raising the whole open card above its siblings — not just the menu
  // — is what actually fixes it; zIndex alone does nothing on Android
  // without a matching `elevation`.
  cardMenuOpen: { zIndex: 50, elevation: 12 },
  tileTop: { height: 4, width: '100%' },
  inner: {
    paddingVertical: 16, paddingHorizontal: 16,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { flex: 1, fontWeight: '700', fontSize: 15, color: theme.colors.textPrimary, lineHeight: 20 },
  rightCol: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  priorityPill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 7 },
  priorityText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  menuBtn: { padding: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  ticketNumber: { fontWeight: '700', fontSize: 12, color: theme.colors.textSecondary, letterSpacing: 0.2 },
  metaDot: { fontSize: 12, color: theme.colors.textTertiary },
  metaText: { fontSize: 12, color: theme.colors.textSecondary, maxWidth: 140, fontWeight: '500' },
  timeAgo: { fontSize: 12, color: theme.colors.textTertiary, fontWeight: '500' },
  slaBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: theme.colors.errorBg, paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: theme.radius.full,
  },
  slaBreach: { fontSize: 10, fontWeight: '800', color: theme.priorityColors.high, letterSpacing: 0.4 },
  resolvedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: theme.statusColors.resolved.bg,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: theme.radius.full,
  },
  resolvedText: { fontSize: 11, fontWeight: '800', color: theme.statusColors.resolved.text, letterSpacing: 0.2 },
  // Action menu
  menu: {
    position: 'absolute', top: 40, right: theme.spacing.md, zIndex: 20, elevation: 20,
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
