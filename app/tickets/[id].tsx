import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, KeyboardAvoidingView } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/common/Screen';
import { subscribeToTicket } from '../../lib/realtime/ticketsChannel';
import { supabase } from '../../lib/supabase';
import { LoadingOverlay } from '../../components/common/LoadingOverlay';
import { AttachmentGrid } from '../../components/tickets/AttachmentGrid';
import { CommentBubble } from '../../components/tickets/CommentBubble';
import { CommentInput } from '../../components/tickets/CommentInput';
import { TicketRatingCard } from '../../components/tickets/TicketRatingCard';
import { getTicketById, updateTicket, claimTicket, reassignTicket } from '../../lib/api/tickets';
import { getTechnicians } from '../../lib/api/profiles';
import { getComments, addComment } from '../../lib/api/comments';
import { getTicketAuditLog } from '../../lib/api/auditLog';
import { useAuthStore } from '../../stores/authStore';
import { canAssignTicket, canChangeStatus, canSeeInternalComments, canReassignTicket } from '../../lib/auth/permissions';
import { ALL_LIFECYCLES, LIFECYCLE_TO_STATUS } from '../../constants/ticket';
import { QUERY_KEYS } from '../../constants/queryKeys';
import { timeAgo, formatDurationBetween } from '../../lib/utils/date';
import { theme } from '../../constants/theme';

type Tab = 'comments' | 'details';

// Ticket priority chip color (small pill in the header stats grid).
const PRIORITY_COLORS: Record<string, { bg: string; text: string }> = {
  low:      { bg: '#DBEAFE', text: '#1D4ED8' },
  medium:   { bg: '#FEF3C7', text: '#B45309' },
  high:     { bg: '#FED7AA', text: '#C2410C' },
  critical: { bg: '#FECACA', text: '#B91C1C' },
};

const STATUS_COLORS: Record<string, string> = {
  open: '#3B82F6',
  in_progress: '#F59E0B',
  resolved: '#10B981',
  closed: '#6B7280',
  cancelled: '#EF4444',
};

export default function TicketDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const profile = useAuthStore((s) => s.profile);
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('comments');

  const { data: ticket, isLoading } = useQuery({ queryKey: QUERY_KEYS.ticket(id), queryFn: () => getTicketById(id) });
  const { data: comments } = useQuery({ queryKey: QUERY_KEYS.ticketComments(id), queryFn: () => getComments(id) });
  const { data: auditLog } = useQuery({ queryKey: QUERY_KEYS.ticketAuditLog(id), queryFn: () => getTicketAuditLog(id) });

  // Realtime — any change on this ticket row, and any inserted comment on
  // it, invalidates the local query so the chat updates without a manual
  // refresh. The DB-side ticket_comments and tickets tables were just
  // added to the supabase_realtime publication; before that, this channel
  // was connecting successfully but the DB never emitted row events for
  // them, which is why comments felt "not realtime" for so long.
  useEffect(() => {
    if (!id) return;
    const channel = subscribeToTicket(id, () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ticket(id) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ticketComments(id) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ticketAuditLog(id) });
    });
    return () => { supabase.removeChannel(channel); };
  }, [id, queryClient]);

  const addCommentMutation = useMutation({
    mutationFn: (vars: { body: string; isInternal: boolean }) =>
      addComment({ ticket_id: id, author_id: profile!.id, body: vars.body, is_internal: vars.isInternal }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ticketComments(id) }),
  });

  const updateLifecycle = useMutation({
    mutationFn: (lifecycle: typeof ALL_LIFECYCLES[number]) =>
      updateTicket(id, { lifecycle, status: LIFECYCLE_TO_STATUS[lifecycle] }, profile?.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ticket(id) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ticketAuditLog(id) });
    },
  });

  const claim = useMutation({
    mutationFn: () => claimTicket(id, profile!.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ticket(id) }),
  });

  const canAssign = !!profile && canAssignTicket(profile);
  const canReassign = !!profile && canReassignTicket(profile);
  const [showTechPicker, setShowTechPicker] = useState(false);

  const { data: technicians } = useQuery({
    queryKey: QUERY_KEYS.technicians(),
    queryFn: getTechnicians,
    enabled: canReassign,
  });

  const reassign = useMutation({
    mutationFn: (technicianId: string) => reassignTicket(id, technicianId, profile!.id),
    onSuccess: () => {
      setShowTechPicker(false);
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ticket(id) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ticketAuditLog(id) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tickets() });
    },
  });

  if (isLoading || !ticket || !profile) return <LoadingOverlay />;

  const canStatus = canChangeStatus(profile);
  const canInternal = canSeeInternalComments(profile);
  const visibleComments = (comments ?? []).filter((c) => !c.is_internal || canInternal);

  // Ticket ID label: use Sampark's id when synced; fall back to "IND-####"
  // built from the RITA UUID's first block so the header always has SOMETHING
  // matching the mockup's IND-0035 look instead of "Sync pending".
  const displayId = ticket.sampark_display_id
    ? `#${ticket.sampark_display_id}`
    : `IND-${ticket.id.slice(0, 4).toUpperCase()}`;

  const created = new Date(ticket.created_at);
  const createdLabel = created.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });

  const priorityColor = PRIORITY_COLORS[ticket.priority] ?? PRIORITY_COLORS.medium;
  const statusColor = STATUS_COLORS[ticket.status] ?? STATUS_COLORS.open;

  return (
    <Screen edges={['top', 'left', 'right']}>
      {/* KeyboardAvoidingView wraps the ENTIRE screen — not just the chat
        * area — so when the keyboard opens the hero + subject + tabs slide
        * up together with the comments list, keeping the CommentInput
        * visible above the keyboard. The previous scoped wrap left the
        * input hidden on Android because behavior={undefined} there just
        * relies on windowSoftInputMode="adjustResize", which doesn't push
        * a nested flex subtree upward when there's a fixed-height header
        * above it. `padding` works reliably on both platforms this way. */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
      {/* ── Navy hero header ─────────────────────────────────────────── */}
      <View style={styles.hero}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={styles.heroBack}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </TouchableOpacity>

        <Text style={styles.heroId}>{displayId}</Text>

        <View style={styles.heroStats}>
          <HeroStat label="STATUS" value={t(`status.${ticket.status}`, { defaultValue: ticket.status.replace('_', ' ') })} accent={statusColor} filled />
          <View style={styles.heroDivider} />
          <HeroStat label="LIFECYCLE" value={t(`lifecycle.${ticket.lifecycle}`, { defaultValue: ticket.lifecycle.replace(/_/g, ' ') })} accent="#fff" outlined />
          <View style={styles.heroDivider} />
          <HeroStat label="PRIORITY" value={ticket.priority} accent={priorityColor.text} pillBg={priorityColor.bg} />
        </View>
      </View>

      {/* ── Subject block ────────────────────────────────────────────── */}
      <View style={styles.subjectBlock}>
        <Text style={styles.subjectLabel}>SUBJECT</Text>
        <Text style={styles.subjectText}>{ticket.description}</Text>
        <Text style={styles.subjectMeta}>
          {(ticket.store?.name ?? '—')} • {createdLabel}
        </Text>
      </View>

      {/* ── Tabs ─────────────────────────────────────────────────────── */}
      <View style={styles.tabRow}>
        <TouchableOpacity onPress={() => setTab('comments')} style={styles.tab}>
          <Text style={[styles.tabText, tab === 'comments' && styles.tabTextActive]}>Comments</Text>
          {tab === 'comments' && <View style={styles.tabUnderline} />}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setTab('details')} style={styles.tab}>
          <Text style={[styles.tabText, tab === 'details' && styles.tabTextActive]}>Details</Text>
          {tab === 'details' && <View style={styles.tabUnderline} />}
        </TouchableOpacity>
      </View>

        {tab === 'comments' ? (
          <>
            <ScrollView contentContainerStyle={styles.commentsScroll} keyboardShouldPersistTaps="always">
              {visibleComments.length === 0 ? (
                <View style={styles.emptyComments}>
                  <Ionicons name="chatbubble-ellipses-outline" size={40} color={theme.colors.textTertiary} />
                  <Text style={styles.emptyCommentsText}>No comments yet</Text>
                </View>
              ) : (
                visibleComments.map((c) => (
                  <CommentBubble key={c.id} comment={c} isOwnComment={c.author_id === profile.id} />
                ))
              )}
            </ScrollView>
            <CommentInput
              canMarkInternal={canInternal}
              isSubmitting={addCommentMutation.isPending}
              onSubmit={(body, isInternal) => addCommentMutation.mutate({ body, isInternal })}
            />
          </>
        ) : (
          <ScrollView contentContainerStyle={styles.detailsScroll} keyboardShouldPersistTaps="always">
            {ticket.long_description && (
              <View style={styles.detailBlock}>
                <Text style={styles.detailLabel}>DESCRIPTION</Text>
                <Text style={styles.detailBody}>{ticket.long_description}</Text>
              </View>
            )}

            <View style={styles.detailBlock}>
              <MetaRow k="Store" v={ticket.store?.name ?? '-'} />
              <MetaRow k="Requester" v={ticket.requester?.display_name ?? '-'} />
              <MetaRow k="Assignee" v={ticket.assignee?.display_name ?? ticket.sampark_technician_name ?? 'Unassigned'} />
              {ticket.category && (
                <MetaRow k="Category" v={[ticket.category, ticket.subcategory, ticket.item].filter(Boolean).join(' › ')} />
              )}
              {ticket.contact_number && <MetaRow k="Contact" v={ticket.contact_number} />}
              {ticket.status === 'resolved' && ticket.resolved_at && (
                <MetaRow k="Resolved in" v={formatDurationBetween(ticket.created_at, ticket.resolved_at) ?? '—'} />
              )}
              {ticket.sla_breached && (
                <Text style={styles.slaBreach}>⚠ SLA breached</Text>
              )}
            </View>

            {ticket.attachments?.length > 0 && (
              <View style={styles.detailBlock}>
                <Text style={styles.detailLabel}>ATTACHMENTS</Text>
                <AttachmentGrid attachments={ticket.attachments} />
              </View>
            )}

            {ticket.requester_id === profile.id && (
              <TicketRatingCard ticketId={ticket.id} />
            )}

            {canAssign && !ticket.assignee_id && (
              <TouchableOpacity style={styles.claimBtn} onPress={() => claim.mutate()} disabled={claim.isPending}>
                <Text style={styles.claimBtnText}>Claim this ticket</Text>
              </TouchableOpacity>
            )}

            {canReassign && (
              <View style={styles.detailBlock}>
                <Text style={styles.detailLabel}>ASSIGNMENT</Text>
                <View style={styles.assignBox}>
                  <View style={styles.assignRow}>
                    <Text style={styles.assignCurrent} numberOfLines={1}>
                      {ticket.assignee?.display_name ?? ticket.sampark_technician_name ?? 'Unassigned'}
                    </Text>
                    <TouchableOpacity style={styles.reassignBtn} onPress={() => setShowTechPicker((v) => !v)}>
                      <Text style={styles.reassignBtnText}>{ticket.assignee_id ? 'Reassign' : 'Assign'}</Text>
                    </TouchableOpacity>
                  </View>
                  {showTechPicker && (
                    <View style={styles.techList}>
                      {(technicians ?? []).length === 0 ? (
                        <Text style={styles.techEmpty}>No approved technicians available.</Text>
                      ) : (
                        (technicians ?? []).map((tech) => {
                          const isCurrent = tech.id === ticket.assignee_id;
                          return (
                            <TouchableOpacity
                              key={tech.id}
                              style={[styles.techRow, isCurrent && styles.techRowActive]}
                              onPress={() => !isCurrent && reassign.mutate(tech.id)}
                              disabled={reassign.isPending || isCurrent}
                            >
                              <View style={{ flex: 1 }}>
                                <Text style={styles.techName}>{tech.display_name}</Text>
                                <Text style={styles.techDept}>{tech.designation ?? 'Technician'}</Text>
                              </View>
                              {isCurrent && <Text style={styles.techCurrentTag}>Current</Text>}
                            </TouchableOpacity>
                          );
                        })
                      )}
                    </View>
                  )}
                </View>
              </View>
            )}

            {canStatus && (
              <View style={styles.detailBlock}>
                <Text style={styles.detailLabel}>UPDATE LIFECYCLE</Text>
                <View style={styles.lifecycleRow}>
                  {ALL_LIFECYCLES.map((lc) => (
                    <TouchableOpacity
                      key={lc}
                      style={[styles.lifecyclePill, ticket.lifecycle === lc && styles.lifecyclePillActive]}
                      onPress={() => updateLifecycle.mutate(lc)}
                    >
                      <Text style={[styles.lifecyclePillText, ticket.lifecycle === lc && styles.lifecyclePillTextActive]}>
                        {t(`lifecycle.${lc}`)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {(auditLog ?? []).length > 0 && (
              <View style={styles.detailBlock}>
                <Text style={styles.detailLabel}>HISTORY</Text>
                {(auditLog ?? []).map((entry) => (
                  <View key={entry.id} style={styles.auditRow}>
                    <Text style={styles.auditAction}>{entry.action.replace(/_/g, ' ')}</Text>
                    <Text style={styles.auditMeta}>
                      {entry.actor?.display_name ?? 'System'} · {timeAgo(entry.created_at)}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}

// ── Small stateless subcomponents ──────────────────────────────────────

function HeroStat({
  label, value, accent, pillBg, filled, outlined,
}: {
  label: string;
  value: string;
  accent: string;
  pillBg?: string;
  filled?: boolean;
  outlined?: boolean;
}) {
  const pillStyle = pillBg
    ? { backgroundColor: pillBg }
    : filled
      ? { backgroundColor: '#fff' }
      : outlined
        ? { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)' }
        : {};
  const textColor = pillBg ? accent : filled ? theme.colors.brand : '#fff';
  return (
    <View style={styles.heroStat}>
      <Text style={styles.heroStatLabel}>{label}</Text>
      <View style={[styles.heroStatPill, pillStyle]}>
        <Text style={[styles.heroStatValue, { color: textColor }]} numberOfLines={1}>{value}</Text>
      </View>
    </View>
  );
}

function MetaRow({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaKey}>{k}</Text>
      <Text style={styles.metaVal} numberOfLines={2}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // ── Hero ────────────────────────────────────────────────────────────
  hero: {
    backgroundColor: theme.colors.brand,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.lg,
  },
  heroBack: { padding: 4, marginBottom: theme.spacing.sm, alignSelf: 'flex-start' },
  heroId: {
    color: '#fff', fontSize: 30, fontWeight: '800', letterSpacing: 0.5,
    marginBottom: theme.spacing.lg,
  },
  heroStats: { flexDirection: 'row', alignItems: 'stretch', gap: theme.spacing.sm },
  heroStat: { flex: 1, gap: 6 },
  heroDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.2)' },
  heroStatLabel: {
    color: 'rgba(255,255,255,0.65)', fontSize: 11, fontWeight: '700',
    letterSpacing: 1.2, textAlign: 'center',
  },
  heroStatPill: {
    borderRadius: 999, paddingHorizontal: theme.spacing.md, paddingVertical: 8,
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center', minWidth: 78,
  },
  heroStatValue: { fontSize: 14, fontWeight: '800', textTransform: 'capitalize' },

  // ── Subject ─────────────────────────────────────────────────────────
  subjectBlock: {
    paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.lg,
    borderBottomWidth: 1, borderBottomColor: theme.colors.border, backgroundColor: '#fff',
  },
  subjectLabel: {
    fontSize: 11, fontWeight: '700', color: theme.colors.textTertiary,
    letterSpacing: 1.2, marginBottom: 6,
  },
  subjectText: { fontSize: 20, fontWeight: '700', color: theme.colors.textPrimary, lineHeight: 26 },
  subjectMeta: {
    fontSize: 13, color: theme.colors.textTertiary, marginTop: 6, fontWeight: '500',
  },

  // ── Tabs ────────────────────────────────────────────────────────────
  tabRow: {
    flexDirection: 'row', paddingHorizontal: theme.spacing.lg, gap: theme.spacing.xl,
    borderBottomWidth: 1, borderBottomColor: theme.colors.border, backgroundColor: '#fff',
  },
  tab: { paddingVertical: theme.spacing.md, position: 'relative' },
  tabText: { fontSize: 16, fontWeight: '600', color: theme.colors.textTertiary },
  tabTextActive: { color: theme.colors.brand, fontWeight: '800' },
  tabUnderline: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: 3,
    backgroundColor: theme.colors.brand, borderTopLeftRadius: 2, borderTopRightRadius: 2,
  },

  // ── Comments tab ────────────────────────────────────────────────────
  commentsScroll: { paddingVertical: theme.spacing.md, flexGrow: 1, backgroundColor: '#F5F6FA' },
  emptyComments: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    gap: 12, paddingVertical: theme.spacing.xxl,
  },
  emptyCommentsText: { fontSize: 14, color: theme.colors.textTertiary, fontWeight: '600' },

  // ── Details tab ─────────────────────────────────────────────────────
  detailsScroll: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl, gap: theme.spacing.lg },
  detailBlock: { gap: theme.spacing.sm },
  detailLabel: {
    fontSize: 11, fontWeight: '700', color: theme.colors.textTertiary,
    letterSpacing: 1.2,
  },
  detailBody: { fontSize: 14, color: theme.colors.textSecondary, lineHeight: 20 },
  metaRow: {
    flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.md,
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  metaKey: { fontSize: 13, color: theme.colors.textTertiary, fontWeight: '500' },
  metaVal: { fontSize: 13, color: theme.colors.textPrimary, fontWeight: '600', flexShrink: 1, textAlign: 'right' },

  slaBreach: { color: theme.priorityColors.critical, fontWeight: '700', fontSize: 13, marginTop: theme.spacing.sm },

  claimBtn: { backgroundColor: theme.colors.brand, borderRadius: theme.radius.md, paddingVertical: theme.spacing.md, alignItems: 'center' },
  claimBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  assignBox: { backgroundColor: theme.colors.surface2, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, padding: theme.spacing.md },
  assignRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.md },
  assignCurrent: { flex: 1, fontSize: 14, fontWeight: '700', color: theme.colors.textPrimary },
  reassignBtn: { backgroundColor: theme.colors.brand, borderRadius: theme.radius.sm, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.xs + 2 },
  reassignBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  techList: { marginTop: theme.spacing.md, borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing.sm, gap: theme.spacing.xs },
  techEmpty: { fontSize: 12, color: theme.colors.textTertiary, fontStyle: 'italic', paddingVertical: theme.spacing.sm },
  techRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm },
  techRowActive: { borderColor: theme.colors.brand, backgroundColor: theme.colors.brand + '10' },
  techName: { fontSize: 13, fontWeight: '700', color: theme.colors.textPrimary },
  techDept: { fontSize: 11, color: theme.colors.textTertiary, marginTop: 1 },
  techCurrentTag: { fontSize: 10, fontWeight: '800', color: theme.colors.brand, textTransform: 'uppercase', letterSpacing: 0.5 },

  lifecycleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs },
  lifecyclePill: { borderWidth: 1.5, borderColor: theme.colors.border, borderRadius: theme.radius.sm, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.xs + 2 },
  lifecyclePillActive: { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand },
  lifecyclePillText: { fontSize: 12, fontWeight: '600', color: theme.colors.textSecondary },
  lifecyclePillTextActive: { color: '#fff' },

  auditRow: { paddingVertical: theme.spacing.sm, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  auditAction: { fontSize: 13, fontWeight: '600', color: theme.colors.textPrimary, textTransform: 'capitalize' },
  auditMeta: { fontSize: 11, color: theme.colors.textTertiary, marginTop: 2 },
});
