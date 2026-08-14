import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Screen } from '../common/Screen';
import { AppHeader } from '../common/AppHeader';
import { submitPocFeedback, getMyFeedback, PocFeedbackInsert } from '../../lib/api/pocFeedback';
import { useAuthStore } from '../../stores/authStore';
import { theme, webNoOutline } from '../../constants/theme';

const FEATURES = [
  { key: 'ticket_creation', label: 'Ticket Creation' },
  { key: 'status_tracking', label: 'Status Tracking' },
  { key: 'photo_attachments', label: 'Photo Attachments' },
  { key: 'push_notifications', label: 'Push Notifications' },
  { key: 'gold_rates', label: 'Gold Rate Updates' },
  { key: 'promotions', label: 'Promotions / Offers' },
  { key: 'checklists', label: 'Daily Checklists' },
];

const VS_WA_LABELS: Record<number, string> = {
  1: 'Much harder',
  2: 'Harder',
  3: 'Same',
  4: 'Easier',
  5: 'Much easier',
};

export function PocFeedbackForm() {
  const profile = useAuthStore((s) => s.profile);
  const qc = useQueryClient();

  const { data: existing, isLoading } = useQuery({
    queryKey: ['poc-feedback', profile?.id],
    queryFn: () => getMyFeedback(profile!.id),
    enabled: !!profile,
  });

  const [ease, setEase] = useState(0);
  const [tracking, setTracking] = useState(0);
  const [overall, setOverall] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [vsWa, setVsWa] = useState(0);
  const [prefer, setPrefer] = useState<'yes' | 'no' | 'maybe' | ''>('');
  const [recommend, setRecommend] = useState<'yes' | 'no' | 'maybe' | ''>('');
  const [features, setFeatures] = useState<string[]>([]);
  const [likedMost, setLikedMost] = useState('');
  const [improvements, setImprovements] = useState('');
  const [additional, setAdditional] = useState('');
  const [initialized, setInitialized] = useState(false);

  if (existing && !initialized) {
    setEase(existing.ease_of_ticket_creation);
    setTracking(existing.ease_of_tracking);
    setOverall(existing.overall_experience);
    setSpeed(existing.app_speed_performance);
    setVsWa(existing.vs_whatsapp);
    setPrefer(existing.would_prefer_app);
    setRecommend(existing.would_recommend);
    setFeatures(existing.useful_features);
    setLikedMost(existing.liked_most ?? '');
    setImprovements(existing.improvements ?? '');
    setAdditional(existing.additional_feedback ?? '');
    setInitialized(true);
  }

  const submit = useMutation({
    mutationFn: async () => {
      if (!profile?.store_id) throw new Error('No store assigned');
      const payload: PocFeedbackInsert = {
        user_id: profile.id,
        store_id: profile.store_id,
        ease_of_ticket_creation: ease,
        ease_of_tracking: tracking,
        overall_experience: overall,
        app_speed_performance: speed,
        vs_whatsapp: vsWa,
        would_prefer_app: prefer as 'yes' | 'no' | 'maybe',
        useful_features: features,
        would_recommend: recommend as 'yes' | 'no' | 'maybe',
        liked_most: likedMost.trim() || null,
        improvements: improvements.trim() || null,
        additional_feedback: additional.trim() || null,
      };
      return submitPocFeedback(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['poc-feedback'] });
      Alert.alert('Thank you!', 'Your feedback has been submitted successfully.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    },
    onError: (e) => Alert.alert('Error', e instanceof Error ? e.message : 'Failed to submit'),
  });

  const valid = ease > 0 && tracking > 0 && overall > 0 && speed > 0 && vsWa > 0 && prefer !== '' && recommend !== '';

  if (isLoading) return <Screen edges={['top']}><AppHeader title="App Feedback" showBack /><ActivityIndicator style={{ marginTop: 40 }} /></Screen>;

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader title="App Feedback" showBack />
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <Text style={s.intro}>Help us improve RITA! Your honest feedback will shape the future of this app.</Text>

        <Section title="1. How easy was it to create a ticket?">
          <StarRow value={ease} onChange={setEase} />
        </Section>

        <Section title="2. How easy was it to track your ticket status?">
          <StarRow value={tracking} onChange={setTracking} />
        </Section>

        <Section title="3. How would you rate the overall app experience?">
          <StarRow value={overall} onChange={setOverall} />
        </Section>

        <Section title="4. How would you rate the app speed & performance?">
          <StarRow value={speed} onChange={setSpeed} />
        </Section>

        <Section title="5. Compared to WhatsApp, reporting issues through this app is:">
          <View style={s.vsRow}>
            {[1, 2, 3, 4, 5].map((v) => (
              <TouchableOpacity
                key={v}
                style={[s.vsPill, vsWa === v && s.vsPillActive]}
                onPress={() => setVsWa(v)}
                activeOpacity={0.7}
              >
                <Text style={[s.vsPillText, vsWa === v && s.vsPillTextActive]}>{VS_WA_LABELS[v]}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Section>

        <Section title="6. Would you prefer using this app over WhatsApp for reporting IT issues?">
          <TriChoice value={prefer} onChange={setPrefer} />
        </Section>

        <Section title="7. Which features do you find most useful?">
          <View style={s.featureGrid}>
            {FEATURES.map((f) => {
              const on = features.includes(f.key);
              return (
                <TouchableOpacity
                  key={f.key}
                  style={[s.featureChip, on && s.featureChipOn]}
                  onPress={() => setFeatures((prev) => on ? prev.filter((x) => x !== f.key) : [...prev, f.key])}
                  activeOpacity={0.7}
                >
                  <Ionicons name={on ? 'checkbox' : 'square-outline'} size={16} color={on ? theme.colors.brand : theme.colors.textTertiary} />
                  <Text style={[s.featureText, on && s.featureTextOn]}>{f.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Section>

        <Section title="8. Would you recommend this app to other stores?">
          <TriChoice value={recommend} onChange={setRecommend} />
        </Section>

        <Section title="9. What did you like most about the app?">
          <TextInput
            style={[s.textArea, webNoOutline]}
            value={likedMost}
            onChangeText={setLikedMost}
            placeholder="Share what worked well..."
            placeholderTextColor={theme.colors.textTertiary}
            multiline
            textAlignVertical="top"
          />
        </Section>

        <Section title="10. What improvements would you suggest?">
          <TextInput
            style={[s.textArea, webNoOutline]}
            value={improvements}
            onChangeText={setImprovements}
            placeholder="What can we do better..."
            placeholderTextColor={theme.colors.textTertiary}
            multiline
            textAlignVertical="top"
          />
        </Section>

        <Section title="11. Any additional feedback?">
          <TextInput
            style={[s.textArea, webNoOutline]}
            value={additional}
            onChangeText={setAdditional}
            placeholder="Anything else you'd like to share..."
            placeholderTextColor={theme.colors.textTertiary}
            multiline
            textAlignVertical="top"
          />
        </Section>

        <TouchableOpacity
          style={[s.submitBtn, !valid && s.submitBtnDisabled]}
          onPress={() => submit.mutate()}
          disabled={!valid || submit.isPending}
          activeOpacity={0.7}
        >
          {submit.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={s.submitText}>{existing ? 'Update Feedback' : 'Submit Feedback'}</Text>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.qLabel}>{title}</Text>
      {children}
    </View>
  );
}

function StarRow({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View style={s.starRow}>
      {[1, 2, 3, 4, 5].map((i) => (
        <TouchableOpacity key={i} onPress={() => onChange(i)} activeOpacity={0.7}>
          <Ionicons name={i <= value ? 'star' : 'star-outline'} size={32} color={i <= value ? theme.colors.accent : theme.colors.border} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

function TriChoice({ value, onChange }: { value: string; onChange: (v: 'yes' | 'no' | 'maybe') => void }) {
  return (
    <View style={s.triRow}>
      {(['yes', 'no', 'maybe'] as const).map((v) => (
        <TouchableOpacity
          key={v}
          style={[s.triPill, value === v && (v === 'yes' ? s.triYes : v === 'no' ? s.triNo : s.triMaybe)]}
          onPress={() => onChange(v)}
          activeOpacity={0.7}
        >
          <Text style={[s.triText, value === v && s.triTextActive]}>
            {v === 'yes' ? 'Yes' : v === 'no' ? 'No' : 'Maybe'}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  scroll: { padding: theme.spacing.lg, paddingBottom: 60 },
  intro: { fontSize: 14, color: theme.colors.textSecondary, lineHeight: 20, marginBottom: theme.spacing.lg },
  section: { marginBottom: theme.spacing.lg },
  qLabel: { fontSize: 14, fontWeight: '700', color: theme.colors.textPrimary, marginBottom: theme.spacing.sm, lineHeight: 20 },
  starRow: { flexDirection: 'row', gap: 8 },
  vsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  vsPill: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface,
  },
  vsPillActive: { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand },
  vsPillText: { fontSize: 12, fontWeight: '600', color: theme.colors.textSecondary },
  vsPillTextActive: { color: '#fff' },
  triRow: { flexDirection: 'row', gap: 10 },
  triPill: {
    flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' as const,
    borderWidth: 1.5, borderColor: theme.colors.border, backgroundColor: theme.colors.surface,
  },
  triYes: { backgroundColor: '#10B981', borderColor: '#10B981' },
  triNo: { backgroundColor: '#EF4444', borderColor: '#EF4444' },
  triMaybe: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  triText: { fontSize: 14, fontWeight: '700', color: theme.colors.textSecondary },
  triTextActive: { color: '#fff' },
  featureGrid: { gap: 8 },
  featureChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10,
    borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface,
  },
  featureChipOn: { borderColor: theme.colors.brand, backgroundColor: theme.colors.brand + '0A' },
  featureText: { fontSize: 13, color: theme.colors.textSecondary, fontWeight: '600' },
  featureTextOn: { color: theme.colors.brand },
  textArea: {
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12,
    backgroundColor: theme.colors.surface, padding: 12, minHeight: 80,
    fontSize: 14, color: theme.colors.textPrimary, lineHeight: 20,
  },
  submitBtn: {
    backgroundColor: theme.colors.brand, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center' as const, marginTop: theme.spacing.md, ...theme.shadows.sm,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
