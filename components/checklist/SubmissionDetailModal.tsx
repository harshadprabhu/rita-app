import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image,
  Animated, TouchableWithoutFeedback, BackHandler, StyleSheet as RNStyleSheet, ActivityIndicator,
} from 'react-native';
import { Portal } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { getSubmissionDetail, getChecklistPhotoUrl, TEMPLATE_LABELS } from '../../lib/api/checklists';
import { theme } from '../../constants/theme';

/**
 * Read-only answer/photo drill-down for one submission — shared by the ops
 * manager's cross-store review screen and the in-store manager's own
 * per-checklist history screen.
 *
 * Built on react-native-paper's Portal (not RN's built-in Modal) — the same
 * fix already applied to notifications' detail popup: RN's Modal wasn't
 * rendering as a clear, obvious popup on this app's web build. Scrolls
 * properly for a long checklist (SM Checklist has 24 questions) since the
 * whole card is capped at 80% of screen height with the question list as
 * the scrollable region inside it.
 */
export function SubmissionDetailModal({ submissionId, onClose }: { submissionId: string | null; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['checklistSubmissionDetail', submissionId],
    queryFn: () => getSubmissionDetail(submissionId!),
    enabled: !!submissionId,
  });

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    if (!submissionId) return;
    fadeAnim.setValue(0);
    scaleAnim.setValue(0.9);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [submissionId]);

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 0.9, duration: 150, useNativeDriver: true }),
    ]).start(onClose);
  };

  useEffect(() => {
    if (!submissionId) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      dismiss();
      return true;
    });
    return () => sub.remove();
  }, [submissionId]);

  if (!submissionId) return null;

  return (
    <Portal>
      <View style={styles.overlay}>
        <TouchableWithoutFeedback onPress={dismiss}>
          <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]} />
        </TouchableWithoutFeedback>
        <Animated.View style={[styles.popup, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
          <View style={styles.header}>
            <View style={styles.iconWrap}>
              <Ionicons name="checkbox" size={18} color={theme.colors.brand} />
            </View>
            <Text style={styles.title} numberOfLines={1}>
              {data?.submission.template ? TEMPLATE_LABELS[data.submission.template.key] : 'Checklist'}
            </Text>
            <TouchableOpacity onPress={dismiss} style={styles.closeBtn} activeOpacity={0.7}>
              <Ionicons name="close" size={20} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <View style={styles.divider} />
          {isLoading || !data ? (
            <ActivityIndicator color={theme.colors.brand} style={{ marginVertical: theme.spacing.xl }} />
          ) : (
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator>
              {data.questions.map((q, i) => {
                const a = data.answers.find((x) => x.question_id === q.id);
                return (
                  <View key={q.id} style={styles.row}>
                    <Text style={styles.rowQ}>{i + 1}. {q.point_of_observation}</Text>
                    <View style={styles.rowAnsLine}>
                      <Text style={[styles.rowAns, a?.answer_value === 'no' && styles.rowAnsBad]}>
                        {a?.answer_value ? a.answer_value.toUpperCase() : '—'}
                      </Text>
                      {a?.resolved_score != null && <Text style={styles.rowScore}>{a.resolved_score} pts</Text>}
                    </View>
                    {a?.photo_path && (
                      <Image source={{ uri: getChecklistPhotoUrl(a.photo_path) }} style={styles.rowPhoto} />
                    )}
                  </View>
                );
              })}
            </ScrollView>
          )}
        </Animated.View>
      </View>
    </Portal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...RNStyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  backdrop: {
    ...RNStyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  popup: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    maxHeight: '80%',
    width: '100%',
    maxWidth: 480,
    ...theme.shadows.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.brand + '14',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  title: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginHorizontal: theme.spacing.lg,
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.lg,
  },
  row: { paddingVertical: theme.spacing.sm, borderBottomWidth: 1, borderBottomColor: theme.colors.border, gap: 4 },
  rowQ: { fontSize: 13, color: theme.colors.textPrimary, lineHeight: 18 },
  rowAnsLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowAns: { fontSize: 12, fontWeight: '800', color: '#059669' },
  rowAnsBad: { color: theme.colors.error },
  rowScore: { fontSize: 11, color: theme.colors.textTertiary },
  rowPhoto: { width: 80, height: 80, borderRadius: theme.radius.sm, marginTop: 4 },
});
