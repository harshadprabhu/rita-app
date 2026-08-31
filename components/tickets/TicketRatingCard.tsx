import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { submitTicketRating, getTicketRating } from '../../lib/api/ticketRatings';
import { useAuthStore } from '../../stores/authStore';
import { theme, webNoOutline } from '../../constants/theme';
import { showAlert } from '../../lib/utils/alert';

interface Props {
  ticketId: string;
}

export function TicketRatingCard({ ticketId }: Props) {
  const profile = useAuthStore((s) => s.profile);
  const qc = useQueryClient();

  const { data: existing, isLoading } = useQuery({
    queryKey: ['ticket-rating', ticketId],
    queryFn: () => getTicketRating(ticketId),
  });

  const [categoryAcc, setCategoryAcc] = useState(0);
  const [easeOfCreation, setEaseOfCreation] = useState(0);
  const [overall, setOverall] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (existing && !initialized) {
    setCategoryAcc(existing.auto_category_accuracy);
    setEaseOfCreation(existing.ease_of_creation);
    setOverall(existing.overall_experience);
    setFeedback(existing.feedback ?? '');
    setInitialized(true);
    setSubmitted(true);
  }

  const submit = useMutation({
    mutationFn: () => submitTicketRating({
      ticket_id: ticketId,
      user_id: profile!.id,
      auto_category_accuracy: categoryAcc,
      ease_of_creation: easeOfCreation,
      overall_experience: overall,
      feedback: feedback.trim() || null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket-rating', ticketId] });
      setSubmitted(true);
    },
    onError: (e) => showAlert('Could not submit rating', e instanceof Error ? e.message : String(e)),
  });

  if (isLoading) return null;

  const valid = categoryAcc > 0 && easeOfCreation > 0 && overall > 0;

  if (submitted && existing) {
    return (
      <View style={s.card}>
        <View style={s.headerRow}>
          <Ionicons name="star" size={16} color={theme.colors.accent} />
          <Text style={s.headerText}>Your Rating</Text>
        </View>
        <View style={s.submittedRow}>
          <RatingSummary label="Auto-Category" value={existing.auto_category_accuracy} />
          <RatingSummary label="Ease of Use" value={existing.ease_of_creation} />
          <RatingSummary label="Overall" value={existing.overall_experience} />
        </View>
        {existing.feedback && <Text style={s.feedbackText}>"{existing.feedback}"</Text>}
        <TouchableOpacity onPress={() => setSubmitted(false)} style={s.editBtn}>
          <Text style={s.editBtnText}>Edit Rating</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.card}>
      <View style={s.headerRow}>
        <Ionicons name="star-outline" size={16} color={theme.colors.accent} />
        <Text style={s.headerText}>Rate This Ticket</Text>
      </View>
      <Text style={s.subtitle}>Help us improve the ticketing experience</Text>

      <Text style={s.qLabel}>Was auto-categorization accurate?</Text>
      <StarRow value={categoryAcc} onChange={setCategoryAcc} />

      <Text style={s.qLabel}>How easy was it to create this ticket?</Text>
      <StarRow value={easeOfCreation} onChange={setEaseOfCreation} />

      <Text style={s.qLabel}>Overall ticketing experience</Text>
      <StarRow value={overall} onChange={setOverall} />

      <TextInput
        style={[s.textArea, webNoOutline]}
        value={feedback}
        onChangeText={setFeedback}
        placeholder="Any suggestions? (optional)"
        placeholderTextColor={theme.colors.textTertiary}
        multiline
        textAlignVertical="top"
      />

      <TouchableOpacity
        style={[s.submitBtn, !valid && s.submitBtnDisabled]}
        onPress={() => submit.mutate()}
        disabled={!valid || submit.isPending}
        activeOpacity={0.7}
      >
        {submit.isPending ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={s.submitText}>{existing ? 'Update' : 'Submit Rating'}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

function StarRow({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View style={s.starRow}>
      {[1, 2, 3, 4, 5].map((i) => (
        <TouchableOpacity key={i} onPress={() => onChange(i)} activeOpacity={0.7} hitSlop={4}>
          <Ionicons name={i <= value ? 'star' : 'star-outline'} size={24} color={i <= value ? theme.colors.accent : theme.colors.border} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

function RatingSummary({ label, value }: { label: string; value: number }) {
  return (
    <View style={s.summaryItem}>
      <Text style={s.summaryValue}>{value}</Text>
      <Ionicons name="star" size={10} color={theme.colors.accent} />
      <Text style={s.summaryLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface, borderRadius: 14,
    borderWidth: 1, borderColor: theme.colors.accent + '33',
    padding: 16, marginTop: theme.spacing.md, ...theme.shadows.xs,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  headerText: { fontSize: 14, fontWeight: '800', color: theme.colors.textPrimary },
  subtitle: { fontSize: 12, color: theme.colors.textTertiary, marginBottom: theme.spacing.md },
  qLabel: { fontSize: 12, fontWeight: '700', color: theme.colors.textSecondary, marginTop: 12, marginBottom: 6 },
  starRow: { flexDirection: 'row', gap: 6 },
  textArea: {
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10,
    backgroundColor: theme.colors.bg, padding: 10, minHeight: 50,
    fontSize: 13, color: theme.colors.textPrimary, marginTop: 14,
  },
  submitBtn: {
    backgroundColor: theme.colors.accent, borderRadius: 10, paddingVertical: 10,
    alignItems: 'center' as const, marginTop: 12,
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  submittedRow: { flexDirection: 'row', gap: 16, marginTop: 8 },
  summaryItem: { alignItems: 'center' as const, gap: 2 },
  summaryValue: { fontSize: 20, fontWeight: '900', color: theme.colors.accent },
  summaryLabel: { fontSize: 9, fontWeight: '700', color: theme.colors.textTertiary },
  feedbackText: { fontSize: 12, color: theme.colors.textSecondary, fontStyle: 'italic', marginTop: 10, lineHeight: 18 },
  editBtn: { marginTop: 8, alignSelf: 'flex-end' as const },
  editBtnText: { fontSize: 11, fontWeight: '700', color: theme.colors.brand },
});
