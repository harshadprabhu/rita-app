import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, Pressable, Image, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Screen } from '../../components/common/Screen';
import { AppHeader } from '../../components/common/AppHeader';
import { EmptyState } from '../../components/common/EmptyState';
import { LoadingOverlay } from '../../components/common/LoadingOverlay';
import { SoftPress } from '../../components/common/SoftPress';
import { NumericText } from '../../components/common/NumericText';
import { StoreSearchPicker } from '../../components/admin/StoreSearchPicker';
import {
  getSubmissionsForDate, getSubmissionDetail, getTemplates, getChecklistPhotoUrl, TEMPLATE_LABELS,
} from '../../lib/api/checklists';
import { getStores } from '../../lib/api/stores';
import { ChecklistTemplateKey } from '../../types';
import { theme } from '../../constants/theme';

function todayIST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}
function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}
function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export default function ChecklistReview() {
  const [date, setDate] = useState(todayIST());
  const [storeId, setStoreId] = useState<string | undefined>(undefined);
  const [templateKey, setTemplateKey] = useState<ChecklistTemplateKey | 'all'>('all');
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data: templates } = useQuery({ queryKey: ['checklistTemplates'], queryFn: getTemplates });
  const { data: stores } = useQuery({ queryKey: ['stores'], queryFn: getStores });
  const templateId = templateKey === 'all' ? undefined : templates?.find((t) => t.key === templateKey)?.id;

  const { data: submissions, isLoading } = useQuery({
    queryKey: ['checklistReview', date, storeId, templateId],
    queryFn: () => getSubmissionsForDate({ date, storeId, templateId }),
  });

  const isToday = date === todayIST();

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader title="Checklist Review" subtitle="SAKSHAM · ALL STORES" showBack />

      <View style={styles.filterBar}>
        <View style={styles.dateRow}>
          <TouchableOpacity onPress={() => setDate((d) => shiftDate(d, -1))} hitSlop={8}>
            <Ionicons name="chevron-back" size={18} color={theme.colors.brand} />
          </TouchableOpacity>
          <Text style={styles.dateText}>{formatDate(date)}{isToday ? ' · Today' : ''}</Text>
          <TouchableOpacity onPress={() => !isToday && setDate((d) => shiftDate(d, 1))} hitSlop={8} disabled={isToday}>
            <Ionicons name="chevron-forward" size={18} color={isToday ? theme.colors.textTertiary : theme.colors.brand} />
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <TouchableOpacity
            style={[styles.chip, templateKey === 'all' && styles.chipActive]}
            onPress={() => setTemplateKey('all')}
          >
            <Text style={[styles.chipText, templateKey === 'all' && styles.chipTextActive]}>All</Text>
          </TouchableOpacity>
          {(templates ?? []).map((t) => (
            <TouchableOpacity
              key={t.id}
              style={[styles.chip, templateKey === t.key && styles.chipActive]}
              onPress={() => setTemplateKey(t.key)}
            >
              <Text style={[styles.chipText, templateKey === t.key && styles.chipTextActive]} numberOfLines={1}>
                {TEMPLATE_LABELS[t.key]?.replace(' Checklist', '') ?? t.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <StoreSearchPicker stores={stores ?? []} selectedId={storeId} onSelect={setStoreId} label="All stores" />
      </View>

      {isLoading ? (
        <LoadingOverlay />
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {!submissions?.length ? (
            <EmptyState icon="checkbox-outline" title="No submissions" subtitle="Nothing submitted for these filters yet." />
          ) : (
            submissions.map((s) => (
              <SoftPress key={s.id} style={[styles.card, theme.shadows.sm]} onPress={() => setDetailId(s.id)}>
                <View style={styles.cardTop}>
                  <Text style={styles.cardStore} numberOfLines={1}>{s.store?.name ?? s.store_id}</Text>
                  <View style={[styles.statusPill, s.status === 'submitted' ? (s.passed ? styles.pillPass : styles.pillFail) : styles.pillPending]}>
                    <Text style={styles.statusPillText}>
                      {s.status !== 'submitted' ? 'In progress' : s.passed ? 'Pass' : 'Fail'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.cardTemplate}>{s.template ? TEMPLATE_LABELS[s.template.key] : ''}</Text>
                <View style={styles.cardBottom}>
                  <Text style={styles.cardMeta}>{s.submitted_by_profile?.display_name ?? '—'}</Text>
                  {s.total_score != null && <NumericText style={styles.cardScore}>{Math.round(s.total_score)}%</NumericText>}
                </View>
              </SoftPress>
            ))
          )}
        </ScrollView>
      )}

      <SubmissionDetailModal submissionId={detailId} onClose={() => setDetailId(null)} />
    </Screen>
  );
}

function SubmissionDetailModal({ submissionId, onClose }: { submissionId: string | null; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['checklistSubmissionDetail', submissionId],
    queryFn: () => getSubmissionDetail(submissionId!),
    enabled: !!submissionId,
  });

  return (
    <Modal visible={!!submissionId} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{data?.submission.template ? TEMPLATE_LABELS[data.submission.template.key] : 'Checklist'}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>
          {isLoading || !data ? (
            <ActivityIndicator color={theme.colors.brand} style={{ marginVertical: theme.spacing.xl }} />
          ) : (
            <ScrollView style={{ maxHeight: 420 }}>
              {data.questions.map((q, i) => {
                const a = data.answers.find((x) => x.question_id === q.id);
                return (
                  <View key={q.id} style={styles.detailRow}>
                    <Text style={styles.detailQ}>{i + 1}. {q.point_of_observation}</Text>
                    <View style={styles.detailAnsRow}>
                      <Text style={[styles.detailAns, a?.answer_value === 'no' && styles.detailAnsBad]}>
                        {a?.answer_value ? a.answer_value.toUpperCase() : '—'}
                      </Text>
                      {a?.resolved_score != null && <Text style={styles.detailScore}>{a.resolved_score} pts</Text>}
                    </View>
                    {a?.photo_path && (
                      <Image source={{ uri: getChecklistPhotoUrl(a.photo_path) }} style={styles.detailPhoto} />
                    )}
                  </View>
                );
              })}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  filterBar: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm, gap: theme.spacing.sm },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.md },
  dateText: { fontSize: 14, fontWeight: '700', color: theme.colors.textPrimary, minWidth: 150, textAlign: 'center' },
  chipRow: { gap: 6, paddingRight: theme.spacing.lg },
  chip: {
    paddingHorizontal: 14, height: 32, justifyContent: 'center',
    borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface,
  },
  chipActive: { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand },
  chipText: { fontSize: 12, fontWeight: '700', color: theme.colors.textSecondary },
  chipTextActive: { color: '#fff' },
  list: { padding: theme.spacing.lg, paddingTop: theme.spacing.sm, gap: theme.spacing.sm },
  card: {
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing.md, gap: 4,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm },
  cardStore: { flex: 1, fontSize: 14, fontWeight: '700', color: theme.colors.textPrimary },
  cardTemplate: { fontSize: 12, color: theme.colors.textSecondary },
  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  cardMeta: { fontSize: 11, color: theme.colors.textTertiary },
  cardScore: { fontSize: 13, fontWeight: '800', color: theme.colors.textPrimary },
  statusPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: theme.radius.full },
  pillPass: { backgroundColor: '#ECFDF5' },
  pillFail: { backgroundColor: '#FEF2F2' },
  pillPending: { backgroundColor: theme.colors.surface2 },
  statusPillText: { fontSize: 10, fontWeight: '800', color: theme.colors.textSecondary },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: theme.colors.surface, borderTopLeftRadius: theme.radius.xl, borderTopRightRadius: theme.radius.xl,
    padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl, maxHeight: '85%',
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: theme.spacing.md },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: theme.colors.textPrimary },
  detailRow: { paddingVertical: theme.spacing.sm, borderBottomWidth: 1, borderBottomColor: theme.colors.border, gap: 4 },
  detailQ: { fontSize: 13, color: theme.colors.textPrimary, lineHeight: 18 },
  detailAnsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  detailAns: { fontSize: 12, fontWeight: '800', color: '#059669' },
  detailAnsBad: { color: theme.colors.error },
  detailScore: { fontSize: 11, color: theme.colors.textTertiary },
  detailPhoto: { width: 80, height: 80, borderRadius: theme.radius.sm, marginTop: 4 },
});
