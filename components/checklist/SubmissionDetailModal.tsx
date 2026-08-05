import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, Pressable, Image, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { getSubmissionDetail, getChecklistPhotoUrl, TEMPLATE_LABELS } from '../../lib/api/checklists';
import { theme } from '../../constants/theme';

/** Read-only answer/photo drill-down for one submission — shared by the ops
 *  manager's cross-store review screen and the in-store manager's own
 *  per-checklist history screen. */
export function SubmissionDetailModal({ submissionId, onClose }: { submissionId: string | null; onClose: () => void }) {
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
