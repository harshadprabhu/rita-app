import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Screen } from '../../components/common/Screen';
import { AppHeader } from '../../components/common/AppHeader';
import { ProfileIconButton } from '../../components/common/ProfileIconButton';
import { SoftPress } from '../../components/common/SoftPress';
import { LoadingOverlay } from '../../components/common/LoadingOverlay';
import { EmptyState } from '../../components/common/EmptyState';
import { NumericText } from '../../components/common/NumericText';
import { getTemplates, getTodaySubmissionsForStore, TEMPLATE_LABELS, todayIST } from '../../lib/api/checklists';
import { useAuthStore } from '../../stores/authStore';
import { canFillChecklists } from '../../constants/roles';
import { DbChecklistSubmission } from '../../types';
import { theme } from '../../constants/theme';

export default function Checklists() {
  const profile = useAuthStore((s) => s.profile);
  const allowed = !!profile && canFillChecklists(profile.role);

  const { data: templates, isLoading: templatesLoading } = useQuery({
    queryKey: ['checklistTemplates'],
    queryFn: getTemplates,
    enabled: allowed,
  });
  const { data: submissions, isLoading: submissionsLoading, refetch, isRefetching } = useQuery({
    queryKey: ['checklistSubmissions', 'today', profile?.store_id],
    queryFn: () => getTodaySubmissionsForStore(profile!.store_id!),
    enabled: allowed && !!profile?.store_id,
  });

  const byTemplate = useMemo(() => {
    const map = new Map<string, DbChecklistSubmission>();
    for (const s of submissions ?? []) map.set(s.template_id, s);
    return map;
  }, [submissions]);

  if (!allowed) {
    return (
      <Screen edges={['top', 'left', 'right']}>
        <AppHeader title="Checklists" />
        <View style={styles.denied}>
          <Ionicons name="lock-closed-outline" size={26} color={theme.colors.textTertiary} />
          <Text style={styles.deniedText}>Only In-Store Managers fill daily checklists.</Text>
        </View>
      </Screen>
    );
  }

  const isLoading = templatesLoading || submissionsLoading;
  const todayLabel = new Date(`${todayIST()}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader
        title="Daily Checklists"
        subtitle="SAKSHAM"
        right={profile ? <ProfileIconButton profile={profile} /> : undefined}
      />
      {isLoading ? (
        <LoadingOverlay />
      ) : (
        <ScrollView
          contentContainerStyle={styles.body}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
        >
          <Text style={styles.dateLabel}>{todayLabel}</Text>
          {!templates?.length ? (
            <EmptyState icon="checkbox-outline" title="No checklists configured" />
          ) : (
            templates.map((t) => {
              const submission = byTemplate.get(t.id);
              const status = !submission
                ? 'not_started'
                : submission.status === 'submitted'
                  ? 'submitted'
                  : 'in_progress';
              return (
                <SoftPress
                  key={t.id}
                  style={[styles.card, theme.shadows.sm]}
                  onPress={() => router.push(`/checklist-fill/${t.key}`)}
                >
                  <View style={styles.cardIcon}>
                    <Ionicons name="checkbox-outline" size={20} color={theme.colors.brand} />
                  </View>
                  <View style={styles.cardBody}>
                    <Text style={styles.cardTitle}>{TEMPLATE_LABELS[t.key] ?? t.name}</Text>
                    {status === 'not_started' && <Text style={styles.statusMuted}>Not started</Text>}
                    {status === 'in_progress' && <Text style={styles.statusPending}>In progress</Text>}
                    {status === 'submitted' && (
                      <View style={styles.submittedRow}>
                        <Text style={[styles.statusDone, submission?.passed === false && styles.statusFailed]}>
                          {submission?.passed === false ? 'Submitted · Below passing' : 'Submitted'}
                        </Text>
                        {submission?.total_score != null && (
                          <NumericText style={styles.scoreText}>{Math.round(submission.total_score)}%</NumericText>
                        )}
                      </View>
                    )}
                  </View>
                  <TouchableOpacity
                    onPress={(e) => { e.stopPropagation(); router.push(`/checklist-history/${t.key}`); }}
                    hitSlop={8}
                    style={styles.historyBtn}
                  >
                    <Ionicons name="time-outline" size={18} color={theme.colors.textTertiary} />
                  </TouchableOpacity>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
                </SoftPress>
              );
            })
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: theme.spacing.lg, gap: theme.spacing.md },
  dateLabel: { fontSize: 11, fontWeight: '800', color: theme.colors.textTertiary, letterSpacing: 0.6, marginTop: -theme.spacing.xs },
  historyBtn: { padding: 4 },
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.sm, padding: theme.spacing.xl },
  deniedText: { color: theme.colors.textSecondary, fontSize: 14, textAlign: 'center' },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md,
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg,
    borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing.md,
  },
  cardIcon: {
    width: 40, height: 40, borderRadius: theme.radius.md,
    backgroundColor: theme.colors.brand + '14', alignItems: 'center', justifyContent: 'center',
  },
  cardBody: { flex: 1, gap: 2 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: theme.colors.textPrimary },
  statusMuted: { fontSize: 12, color: theme.colors.textTertiary, fontWeight: '600' },
  statusPending: { fontSize: 12, color: theme.colors.accent, fontWeight: '700' },
  statusDone: { fontSize: 12, color: '#10B981', fontWeight: '700' },
  statusFailed: { color: theme.colors.error },
  submittedRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  scoreText: { fontSize: 12, fontWeight: '700', color: theme.colors.textSecondary },
});
