import React, { useState } from 'react';
import { StyleSheet, ScrollView, View, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Screen } from '../../components/common/Screen';
import { AppHeader } from '../../components/common/AppHeader';
import { EmptyState } from '../../components/common/EmptyState';
import { LoadingOverlay } from '../../components/common/LoadingOverlay';
import { SoftPress } from '../../components/common/SoftPress';
import { NumericText } from '../../components/common/NumericText';
import { SubmissionDetailModal } from '../../components/checklist/SubmissionDetailModal';
import { getTemplateByKey, getSubmissionHistoryForStore, TEMPLATE_LABELS } from '../../lib/api/checklists';
import { useAuthStore } from '../../stores/authStore';
import { ChecklistTemplateKey } from '../../types';
import { theme } from '../../constants/theme';

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export default function ChecklistHistory() {
  const { templateKey } = useLocalSearchParams<{ templateKey: ChecklistTemplateKey }>();
  const profile = useAuthStore((s) => s.profile);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data: template } = useQuery({
    queryKey: ['checklistTemplate', templateKey],
    queryFn: () => getTemplateByKey(templateKey),
    enabled: !!templateKey,
  });

  const { data: history, isLoading } = useQuery({
    queryKey: ['checklistHistory', template?.id, profile?.store_id],
    queryFn: () => getSubmissionHistoryForStore(profile!.store_id!, template!.id),
    enabled: !!template && !!profile?.store_id,
  });

  return (
    <Screen>
      <AppHeader title={`${TEMPLATE_LABELS[templateKey] ?? 'Checklist'} History`} showBack />
      {isLoading || !template ? (
        <LoadingOverlay />
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          {!history?.length ? (
            <EmptyState icon="time-outline" title="No history yet" subtitle="Past submissions will show up here." />
          ) : (
            history.map((s) => (
              <SoftPress key={s.id} style={[styles.card, theme.shadows.sm]} onPress={() => setDetailId(s.id)}>
                <View style={styles.cardLeft}>
                  <Text style={styles.cardDate}>{formatDate(s.submission_date)}</Text>
                  <Text style={styles.cardStatus}>
                    {s.status !== 'submitted' ? 'In progress' : s.passed ? 'Passed' : 'Below passing'}
                  </Text>
                </View>
                {s.total_score != null && (
                  <View style={[styles.scoreBadge, s.passed === false && styles.scoreBadgeFail]}>
                    <NumericText style={[styles.scoreText, s.passed === false && styles.scoreTextFail]}>
                      {Math.round(s.total_score)}%
                    </NumericText>
                  </View>
                )}
              </SoftPress>
            ))
          )}
        </ScrollView>
      )}
      <SubmissionDetailModal submissionId={detailId} onClose={() => setDetailId(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: theme.spacing.lg, gap: theme.spacing.sm },
  card: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing.md,
  },
  cardLeft: { gap: 2 },
  cardDate: { fontSize: 14, fontWeight: '700', color: theme.colors.textPrimary },
  cardStatus: { fontSize: 12, color: theme.colors.textTertiary },
  scoreBadge: { backgroundColor: '#ECFDF5', borderRadius: theme.radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  scoreBadgeFail: { backgroundColor: '#FEF2F2' },
  scoreText: { fontSize: 13, fontWeight: '800', color: '#059669' },
  scoreTextFail: { color: theme.colors.error },
});
