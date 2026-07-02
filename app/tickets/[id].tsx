import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Screen } from '../../components/common/Screen';
import { AppHeader } from '../../components/common/AppHeader';
import { LoadingOverlay } from '../../components/common/LoadingOverlay';
import { StatusChip, LifecycleChip } from '../../components/common/StatusChip';
import { PriorityBadge } from '../../components/common/PriorityBadge';
import { AttachmentGrid } from '../../components/tickets/AttachmentGrid';
import { CommentBubble } from '../../components/tickets/CommentBubble';
import { CommentInput } from '../../components/tickets/CommentInput';
import { getTicketById, updateTicket, claimTicket } from '../../lib/api/tickets';
import { getComments, addComment } from '../../lib/api/comments';
import { getTicketAuditLog } from '../../lib/api/auditLog';
import { useAuthStore } from '../../stores/authStore';
import { canAssignTicket, canChangeStatus, canSeeInternalComments } from '../../lib/auth/permissions';
import { ALL_LIFECYCLES, LIFECYCLE_TO_STATUS } from '../../constants/ticket';
import { QUERY_KEYS } from '../../constants/queryKeys';
import { timeAgo } from '../../lib/utils/date';
import { theme } from '../../constants/theme';

type Tab = 'comments' | 'audit';

export default function TicketDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const profile = useAuthStore((s) => s.profile);
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('comments');

  const { data: ticket, isLoading } = useQuery({ queryKey: QUERY_KEYS.ticket(id), queryFn: () => getTicketById(id) });
  const { data: comments } = useQuery({ queryKey: QUERY_KEYS.ticketComments(id), queryFn: () => getComments(id) });
  const { data: auditLog } = useQuery({ queryKey: QUERY_KEYS.ticketAuditLog(id), queryFn: () => getTicketAuditLog(id) });

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

  if (isLoading || !ticket || !profile) return <LoadingOverlay />;

  const canAssign = canAssignTicket(profile);
  const canStatus = canChangeStatus(profile);
  const canInternal = canSeeInternalComments(profile);
  const visibleComments = (comments ?? []).filter((c) => !c.is_internal || canInternal);

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader title={ticket.ticket_number} showBack />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        <ScrollView contentContainerStyle={styles.summary} keyboardShouldPersistTaps="always">
          <View style={styles.topRow}>
            <PriorityBadge priority={ticket.priority} />
            <StatusChip status={ticket.status} />
            <LifecycleChip lifecycle={ticket.lifecycle} />
          </View>
          <Text style={styles.description}>{ticket.description}</Text>
          {ticket.long_description && <Text style={styles.longDescription}>{ticket.long_description}</Text>}

          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Store</Text>
            <Text style={styles.metaValue}>{ticket.store?.name ?? '-'}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Requester</Text>
            <Text style={styles.metaValue}>{ticket.requester?.display_name ?? '-'}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Assignee</Text>
            <Text style={styles.metaValue}>{ticket.assignee?.display_name ?? 'Unassigned'}</Text>
          </View>
          {ticket.sla_breached && <Text style={styles.slaBreach}>⚠ SLA breached</Text>}

          <Text style={styles.sectionLabel}>Attachments</Text>
          <AttachmentGrid attachments={ticket.attachments} />

          {canAssign && !ticket.assignee_id && (
            <TouchableOpacity style={styles.claimBtn} onPress={() => claim.mutate()} disabled={claim.isPending}>
              <Text style={styles.claimBtnText}>Claim this ticket</Text>
            </TouchableOpacity>
          )}

          {canStatus && (
            <>
              <Text style={styles.sectionLabel}>Update lifecycle</Text>
              <View style={styles.lifecycleRow}>
                {ALL_LIFECYCLES.map((lc) => (
                  <TouchableOpacity
                    key={lc}
                    style={[styles.lifecyclePill, ticket.lifecycle === lc && styles.lifecyclePillActive]}
                    onPress={() => updateLifecycle.mutate(lc)}
                  >
                    <Text style={[styles.lifecyclePillText, ticket.lifecycle === lc && styles.lifecyclePillTextActive]}>{t(`lifecycle.${lc}`)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          <View style={styles.tabRow}>
            <TouchableOpacity onPress={() => setTab('comments')} style={[styles.tab, tab === 'comments' && styles.tabActive]}>
              <Text style={[styles.tabText, tab === 'comments' && styles.tabTextActive]}>Comments</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setTab('audit')} style={[styles.tab, tab === 'audit' && styles.tabActive]}>
              <Text style={[styles.tabText, tab === 'audit' && styles.tabTextActive]}>History</Text>
            </TouchableOpacity>
          </View>

          {tab === 'comments' && visibleComments.map((c) => (
            <CommentBubble key={c.id} comment={c} isOwnComment={c.author_id === profile.id} />
          ))}

          {tab === 'audit' && (auditLog ?? []).map((entry) => (
            <View key={entry.id} style={styles.auditRow}>
              <Text style={styles.auditAction}>{entry.action.replace(/_/g, ' ')}</Text>
              <Text style={styles.auditMeta}>
                {entry.actor?.display_name ?? 'System'} · {timeAgo(entry.created_at)}
              </Text>
            </View>
          ))}
        </ScrollView>

        {tab === 'comments' && (
          <CommentInput
            canMarkInternal={canInternal}
            isSubmitting={addCommentMutation.isPending}
            onSubmit={(body, isInternal) => addCommentMutation.mutate({ body, isInternal })}
          />
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginBottom: theme.spacing.md },
  description: { fontSize: 16, fontWeight: '600', color: theme.colors.textPrimary, marginBottom: theme.spacing.sm },
  longDescription: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: theme.spacing.md },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  metaLabel: { fontSize: 12, color: theme.colors.textTertiary },
  metaValue: { fontSize: 12, color: theme.colors.textPrimary, fontWeight: '600' },
  slaBreach: { color: theme.priorityColors.critical, fontWeight: '700', marginTop: theme.spacing.sm },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: theme.colors.textSecondary, letterSpacing: 0.8, marginTop: theme.spacing.lg, marginBottom: theme.spacing.sm },
  claimBtn: { backgroundColor: theme.colors.brand, borderRadius: theme.radius.md, paddingVertical: theme.spacing.md, alignItems: 'center', marginTop: theme.spacing.lg },
  claimBtnText: { color: '#fff', fontWeight: '700' },
  lifecycleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs },
  lifecyclePill: { borderWidth: 1.5, borderColor: theme.colors.border, borderRadius: theme.radius.sm, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.xs },
  lifecyclePillActive: { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand },
  lifecyclePillText: { fontSize: 11, fontWeight: '600', color: theme.colors.textSecondary },
  lifecyclePillTextActive: { color: '#fff' },
  tabRow: { flexDirection: 'row', marginTop: theme.spacing.xl, marginBottom: theme.spacing.sm, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  tab: { paddingVertical: theme.spacing.sm, marginRight: theme.spacing.lg },
  tabActive: { borderBottomWidth: 2, borderBottomColor: theme.colors.brand },
  tabText: { fontSize: 13, color: theme.colors.textTertiary, fontWeight: '600' },
  tabTextActive: { color: theme.colors.brand },
  auditRow: { paddingVertical: theme.spacing.sm, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  auditAction: { fontSize: 13, fontWeight: '600', color: theme.colors.textPrimary, textTransform: 'capitalize' },
  auditMeta: { fontSize: 11, color: theme.colors.textTertiary, marginTop: 2 },
});
