import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Screen } from '../../components/common/Screen';
import { AppHeader } from '../../components/common/AppHeader';
import { SoftPress } from '../../components/common/SoftPress';
import { LoadingOverlay } from '../../components/common/LoadingOverlay';
import {
  getTemplateByKey, getQuestions, getOrCreateTodaySubmission, getAnswers,
  saveAnswer, uploadChecklistPhoto, submitChecklist, TEMPLATE_LABELS,
} from '../../lib/api/checklists';
import { useAuthStore } from '../../stores/authStore';
import { useUiStore } from '../../stores/uiStore';
import { DbChecklistQuestion, ChecklistTemplateKey } from '../../types';
import { theme } from '../../constants/theme';

// SM Checklist's non-question rows (workbook rows 37-59) — sign-off
// reminders + a Daily/Weekly cadence legend. Reference text only, not
// modeled as answerable questions.
const SM_SIGNOFF_REMINDERS = [
  'Sign & Remark on daily stock count summary for previous day closing & current day opening',
  "Sign & Remark on daily cash tally report & current day's cash banking details.",
  'Sign & Remark on daily petty cash balance & voucher in hand statement',
  'Sign & Remark on all open MTO order Req Id vs MTO Advance Receipts vs Bill Made Report',
  "Sign & Remark on previous day's sales return & check physical return stock",
  'Sign & Remark on daily TO received vs TO Inwarded status along with physical stock handover to floor',
  'Sign & Remark on daily gold meeting status report & check physical gold weight & COGEP credit note created',
  'Sign & Remark on daily karatmeter & weighing scale calibration register',
];

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function useStagedPhoto() {
  const [photos, setPhotos] = useState<Record<string, { uri: string; name: string }>>({});
  const setPhoto = (questionId: string, uri: string, name: string) =>
    setPhotos((prev) => ({ ...prev, [questionId]: { uri, name } }));
  return { photos, setPhoto };
}

export default function ChecklistFill() {
  const { templateKey } = useLocalSearchParams<{ templateKey: ChecklistTemplateKey }>();
  const profile = useAuthStore((s) => s.profile);
  const qc = useQueryClient();
  const showToast = useUiStore((s) => s.showToast);

  const { data: template } = useQuery({
    queryKey: ['checklistTemplate', templateKey],
    queryFn: () => getTemplateByKey(templateKey),
    enabled: !!templateKey,
  });

  const { data: submission, isLoading: submissionLoading } = useQuery({
    queryKey: ['checklistSubmission', template?.id, profile?.store_id],
    queryFn: () => getOrCreateTodaySubmission(template!.id, profile!.store_id!, profile!.id),
    enabled: !!template && !!profile?.store_id,
  });

  const { data: questions, isLoading: questionsLoading } = useQuery({
    queryKey: ['checklistQuestions', template?.id],
    queryFn: () => getQuestions(template!.id),
    enabled: !!template,
  });

  const { data: existingAnswers } = useQuery({
    queryKey: ['checklistAnswers', submission?.id],
    queryFn: () => getAnswers(submission!.id),
    enabled: !!submission,
  });

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const { photos, setPhoto } = useStagedPhoto();
  const hydrated = useRef(false);

  // Prefill from a previously in-progress submission — once, so it doesn't
  // clobber answers the user is actively editing on refetch.
  useEffect(() => {
    if (hydrated.current || !existingAnswers) return;
    const map: Record<string, string> = {};
    for (const a of existingAnswers) if (a.answer_value) map[a.question_id] = a.answer_value;
    setAnswers(map);
    hydrated.current = true;
  }, [existingAnswers]);

  const existingPhotoPaths = useMemo(() => {
    const map: Record<string, string> = {};
    for (const a of existingAnswers ?? []) if (a.photo_path) map[a.question_id] = a.photo_path;
    return map;
  }, [existingAnswers]);

  const setAnswer = (questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    // Autosave immediately — cheap (one row), keeps progress safe if the app
    // is killed mid-checklist. Photos are staged and uploaded at submit only.
    saveAnswer(submission!.id, questionId, value).catch(() => null);
  };

  const pickPhoto = async (questionId: string) => {
    const openGallery = async () => {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
      if (!result.canceled && result.assets[0]) {
        const a = result.assets[0];
        setPhoto(questionId, a.uri, a.fileName ?? `photo_${Date.now()}.jpg`);
      }
    };
    if (Platform.OS === 'web') { await openGallery(); return; }
    const openCamera = async () => {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return;
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
      if (!result.canceled && result.assets[0]) {
        const a = result.assets[0];
        setPhoto(questionId, a.uri, a.fileName ?? `photo_${Date.now()}.jpg`);
      }
    };
    Alert.alert('Add photo', 'Take a new photo or choose from your gallery.', [
      { text: 'Camera', onPress: openCamera },
      { text: 'Gallery', onPress: openGallery },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const submit = useMutation({
    mutationFn: async () => {
      if (!submission || !questions) throw new Error('Not ready');

      // Every question is mandatory, including weekly-cadence reminders and
      // every photo marked as required.
      const missing = questions.filter((q) => !answers[q.id]?.trim());
      if (missing.length) {
        throw new Error(`Please answer: ${missing[0].point_of_observation.slice(0, 60)}${missing.length > 1 ? ` (+${missing.length - 1} more)` : ''}`);
      }
      const missingPhoto = questions.filter((q) => q.requires_photo && !photos[q.id] && !existingPhotoPaths[q.id]);
      if (missingPhoto.length) {
        throw new Error(`Photo required: ${missingPhoto[0].point_of_observation.slice(0, 60)}`);
      }

      // Persist any answers not yet autosaved (e.g. numeric fields edited
      // without losing focus), then upload staged photos, then score.
      await Promise.all(
        questions.map((q) => (answers[q.id] ? saveAnswer(submission.id, q.id, answers[q.id]) : Promise.resolve())),
      );
      await Promise.all(
        Object.entries(photos).map(([qid, p]) => uploadChecklistPhoto(submission.id, qid, p.uri, p.name)),
      );
      return submitChecklist(submission.id);
    },
    onSuccess: (result) => {
      // Invalidate everything this submission could be read back through —
      // today's list, this screen's own query, its answers, and history —
      // so nothing shows stale "in progress" state if the user returns here.
      qc.invalidateQueries({ queryKey: ['checklistSubmissions'] });
      qc.invalidateQueries({ queryKey: ['checklistSubmission'] });
      qc.invalidateQueries({ queryKey: ['checklistAnswers'] });
      qc.invalidateQueries({ queryKey: ['checklistHistory'] });
      const score = result.total_score != null ? Math.round(result.total_score) : null;
      showToast(
        result.passed === false
          ? `Submitted — below passing${score != null ? ` (${score}%)` : ''}`
          : `Checklist submitted${score != null ? ` — ${score}%` : ''}`,
        result.passed === false ? 'error' : 'success',
      );
      // Alert.alert is a no-op on web (react-native-web never renders it) —
      // that's what made this screen look frozen after submit: the toast
      // above is the only user-visible confirmation, so navigate away
      // directly instead of waiting on an Alert button that never appears.
      router.back();
    },
    onError: (e) => showToast(e instanceof Error ? e.message : String(e), 'error'),
  });

  const isLoading = submissionLoading || questionsLoading || !template;
  const alreadySubmitted = submission?.status === 'submitted';

  return (
    <Screen>
      <AppHeader title={TEMPLATE_LABELS[templateKey] ?? 'Checklist'} showBack />
      {isLoading ? (
        <LoadingOverlay />
      ) : (
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {submission?.submission_date && (
            <Text style={styles.dateLabel}>{formatDate(submission.submission_date)}</Text>
          )}
          {alreadySubmitted && (
            <View style={styles.submittedBanner}>
              <Ionicons name="checkmark-circle" size={16} color="#10B981" />
              <Text style={styles.submittedBannerText}>
                Submitted{submission?.total_score != null ? ` · Score ${Math.round(submission.total_score)}%` : ''}
                {submission?.submitted_at ? ` · Next submission tomorrow` : ''}
              </Text>
            </View>
          )}
          {(questions ?? []).map((q, i) => (
            <QuestionRow
              key={q.id}
              index={i + 1}
              question={q}
              value={answers[q.id]}
              onChange={(v) => setAnswer(q.id, v)}
              photoStaged={!!photos[q.id]}
              photoExisting={!!existingPhotoPaths[q.id]}
              onPickPhoto={() => pickPhoto(q.id)}
              disabled={alreadySubmitted}
            />
          ))}

          {templateKey === 'sm_checklist' && (
            <View style={styles.reminderBlock}>
              <Text style={styles.reminderTitle}>SIGN-OFF REMINDERS</Text>
              {SM_SIGNOFF_REMINDERS.map((r) => (
                <View key={r} style={styles.reminderRow}>
                  <Ionicons name="ellipse" size={4} color={theme.colors.textTertiary} style={{ marginTop: 7 }} />
                  <Text style={styles.reminderText}>{r}</Text>
                </View>
              ))}
            </View>
          )}

          {!alreadySubmitted && (
            <SoftPress
              style={[styles.submitBtn, theme.shadows.md, submit.isPending && styles.submitBtnDisabled]}
              onPress={() => submit.mutate()}
              disabled={submit.isPending}
            >
              <LinearGradient colors={theme.gradients.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.submitBtnInner}>
                {submit.isPending ? <ActivityIndicator color={theme.colors.textPrimary} /> : (
                  <>
                    <Ionicons name="checkmark-done" size={16} color={theme.colors.textPrimary} />
                    <Text style={styles.submitBtnText}>Submit Checklist</Text>
                  </>
                )}
              </LinearGradient>
            </SoftPress>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

function QuestionRow({
  index, question, value, onChange, photoStaged, photoExisting, onPickPhoto, disabled,
}: {
  index: number;
  question: DbChecklistQuestion;
  value: string | undefined;
  onChange: (v: string) => void;
  photoStaged: boolean;
  photoExisting: boolean;
  onPickPhoto: () => void;
  disabled: boolean;
}) {
  const hasPhoto = photoStaged || photoExisting;
  return (
    <View style={styles.qCard}>
      <View style={styles.qHeaderRow}>
        <Text style={styles.qIndex}>{index}</Text>
        <Text style={styles.qText}>{question.point_of_observation}</Text>
      </View>
      {question.cadence_note && <Text style={styles.qCadence}>{question.cadence_note}</Text>}

      {question.question_type === 'numeric' ? (
        <TextInput
          style={styles.numericInput}
          value={value ?? ''}
          onChangeText={onChange}
          placeholder="Enter a number"
          placeholderTextColor={theme.colors.textTertiary}
          keyboardType="number-pad"
          editable={!disabled}
        />
      ) : (
        <View style={styles.pillRow}>
          {(['yes', 'no', 'na'] as const).map((opt) => (
            <TouchableOpacity
              key={opt}
              style={[styles.pill, value === opt && styles.pillActive]}
              onPress={() => !disabled && onChange(opt)}
              disabled={disabled}
              activeOpacity={0.7}
            >
              <Text style={[styles.pillText, value === opt && styles.pillTextActive]}>
                {opt === 'na' ? 'N/A' : opt.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {question.requires_photo && (
        <TouchableOpacity style={styles.photoBtn} onPress={onPickPhoto} disabled={disabled} activeOpacity={0.7}>
          <Ionicons name={hasPhoto ? 'checkmark-circle' : 'camera-outline'} size={16} color={hasPhoto ? '#10B981' : theme.colors.brand} />
          <Text style={[styles.photoBtnText, hasPhoto && { color: '#10B981' }]}>
            {hasPhoto ? 'Photo added' : 'Photo required — tap to add'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl * 2, gap: theme.spacing.md },
  dateLabel: { fontSize: 11, fontWeight: '800', color: theme.colors.textTertiary, letterSpacing: 0.6, marginTop: -theme.spacing.xs },
  submittedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm,
    backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#A7F3D0',
    borderRadius: theme.radius.md, padding: theme.spacing.sm, marginBottom: theme.spacing.xs,
  },
  submittedBannerText: { fontSize: 12, fontWeight: '700', color: '#059669' },
  qCard: {
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing.md, gap: theme.spacing.sm,
  },
  qHeaderRow: { flexDirection: 'row', gap: theme.spacing.sm },
  qIndex: { fontSize: 12, fontWeight: '800', color: theme.colors.textTertiary, width: 20 },
  qText: { flex: 1, fontSize: 14, color: theme.colors.textPrimary, lineHeight: 20, fontWeight: '600' },
  qCadence: { fontSize: 11, color: theme.colors.textTertiary, marginLeft: 28, fontStyle: 'italic' },
  pillRow: { flexDirection: 'row', gap: theme.spacing.sm, marginLeft: 28 },
  pill: {
    flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 9,
    borderWidth: 1, backgroundColor: theme.colors.surface2, borderColor: theme.colors.border,
  },
  pillActive: { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand },
  pillText: { fontSize: 12, fontWeight: '700', color: theme.colors.textSecondary },
  pillTextActive: { color: '#fff' },
  numericInput: {
    marginLeft: 28, backgroundColor: theme.colors.surface2, borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: 9, paddingHorizontal: theme.spacing.md, height: 42, color: theme.colors.textPrimary, fontSize: 14,
  },
  photoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 28, alignSelf: 'flex-start',
    backgroundColor: theme.colors.brand + '10', borderWidth: 1, borderColor: theme.colors.brand + '33',
    borderRadius: theme.radius.full, paddingHorizontal: theme.spacing.sm + 2, paddingVertical: 5,
  },
  photoBtnText: { fontSize: 11, fontWeight: '700', color: theme.colors.brand },
  reminderBlock: {
    backgroundColor: theme.colors.surface2, borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing.md, gap: theme.spacing.xs,
  },
  reminderTitle: { fontSize: 10, fontWeight: '800', color: theme.colors.textTertiary, letterSpacing: 0.8, marginBottom: 4 },
  reminderRow: { flexDirection: 'row', gap: theme.spacing.sm },
  reminderText: { flex: 1, fontSize: 12, color: theme.colors.textSecondary, lineHeight: 17 },
  submitBtn: { borderRadius: theme.radius.md, overflow: 'hidden', marginTop: theme.spacing.md },
  submitBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.sm, height: 52 },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: theme.colors.textPrimary, fontSize: 15, fontWeight: '800' },
});
