import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Screen } from './Screen';
import { AppHeader } from './AppHeader';
import { SoftPress } from './SoftPress';
import { getActivePromotion, createPromotion, PROMOTION_MAX_LEN } from '../../lib/api/broadcasts';
import { useAuthStore } from '../../stores/authStore';
import { canPushPromotions } from '../../constants/roles';
import { webNoOutline, theme } from '../../constants/theme';

/**
 * Ops Manager promotions: one short line (scheme / offer) shown on the gold-rate
 * poster, e.g. "10% off on all making charges". Publishing replaces the current
 * one; clearing removes it. Ops Manager (and admin) only.
 */
export function PromotionsScreen() {
  const profile = useAuthStore((s) => s.profile);
  const qc = useQueryClient();
  const [text, setText] = useState('');

  const allowed = !!profile && canPushPromotions(profile.role);

  const { data: current, isLoading } = useQuery({
    queryKey: ['activePromotion'],
    queryFn: getActivePromotion,
    enabled: allowed,
  });

  const publish = useMutation({
    mutationFn: (body: string) => createPromotion(profile!.id, body),
    onSuccess: () => {
      setText('');
      qc.invalidateQueries({ queryKey: ['activePromotion'] });
    },
  });

  if (!allowed) {
    return (
      <Screen edges={['top', 'left', 'right']}>
        <AppHeader title="Promotions" showBack />
        <View style={styles.denied}>
          <Ionicons name="lock-closed-outline" size={26} color={theme.colors.textTertiary} />
          <Text style={styles.deniedText}>Only Ops Managers can publish promotions.</Text>
        </View>
      </Screen>
    );
  }

  const remaining = PROMOTION_MAX_LEN - text.length;

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader title="Promotions" subtitle="SHOWN ON THE GOLD RATE POSTER" showBack />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {/* Currently live */}
        <Text style={styles.label}>CURRENTLY ON THE POSTER</Text>
        <View style={styles.currentCard}>
          {isLoading ? (
            <ActivityIndicator color={theme.colors.accent} />
          ) : current ? (
            <Text style={styles.currentText}>{current}</Text>
          ) : (
            <Text style={styles.currentEmpty}>No promotion — the poster space is blank.</Text>
          )}
        </View>

        {/* Compose */}
        <View style={styles.labelRow}>
          <Text style={[styles.label, styles.spaced]}>NEW PROMOTION</Text>
          <Text style={[styles.counter, remaining < 0 && { color: theme.colors.error }]}>{remaining}</Text>
        </View>
        <TextInput
          style={[styles.input, webNoOutline]}
          value={text}
          onChangeText={(t) => setText(t.slice(0, PROMOTION_MAX_LEN))}
          placeholder="e.g. 10% off on all making charges this festive season"
          placeholderTextColor={theme.colors.textTertiary}
          maxLength={PROMOTION_MAX_LEN}
          multiline
        />
        <Text style={styles.hint}>Keep it short — it prints as one line on the poster (max {PROMOTION_MAX_LEN} characters).</Text>

        <SoftPress
          style={[styles.publishBtn, (!text.trim() || publish.isPending) && styles.publishBtnDisabled]}
          onPress={() => publish.mutate(text.trim())}
          disabled={!text.trim() || publish.isPending}
        >
          {publish.isPending ? <ActivityIndicator color={theme.colors.textPrimary} /> : (
            <>
              <Ionicons name="megaphone" size={15} color={theme.colors.textPrimary} />
              <Text style={styles.publishText}>Publish Promotion</Text>
            </>
          )}
        </SoftPress>

        {current && (
          <SoftPress
            style={styles.clearBtn}
            onPress={() => publish.mutate('')}
            disabled={publish.isPending}
          >
            <Text style={styles.clearText}>Clear the current promotion</Text>
          </SoftPress>
        )}
        {publish.isError && <Text style={styles.error}>{String(publish.error)}</Text>}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: theme.spacing.lg },
  label: { fontSize: 10, fontWeight: '800', color: theme.colors.textTertiary, letterSpacing: 1 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  spaced: { marginTop: theme.spacing.xl },
  counter: { fontSize: 11, fontWeight: '700', color: theme.colors.textTertiary, marginTop: theme.spacing.xl },
  currentCard: {
    marginTop: theme.spacing.sm, minHeight: 54, justifyContent: 'center',
    backgroundColor: theme.colors.accentLight, borderWidth: 1, borderColor: theme.colors.accent + '55',
    borderRadius: theme.radius.md, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.md,
  },
  currentText: { fontSize: 14, fontWeight: '700', color: theme.colors.textPrimary },
  currentEmpty: { fontSize: 13, color: theme.colors.textTertiary, fontStyle: 'italic' },
  input: {
    marginTop: theme.spacing.sm, backgroundColor: theme.colors.surface,
    borderWidth: 1.5, borderColor: theme.colors.border, borderRadius: theme.radius.md,
    padding: theme.spacing.md, fontSize: 15, color: theme.colors.textPrimary, minHeight: 72, textAlignVertical: 'top',
  },
  hint: { fontSize: 12, color: theme.colors.textTertiary, marginTop: theme.spacing.xs },
  publishBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.sm,
    backgroundColor: theme.colors.accent, borderRadius: theme.radius.md, height: 50, marginTop: theme.spacing.xl,
  },
  publishBtnDisabled: { opacity: 0.5 },
  publishText: { color: theme.colors.textPrimary, fontSize: 15, fontWeight: '800' },
  clearBtn: { alignItems: 'center', paddingVertical: theme.spacing.md, marginTop: theme.spacing.sm },
  clearText: { color: theme.colors.error, fontSize: 13, fontWeight: '700' },
  error: { color: theme.colors.error, fontSize: 13, marginTop: theme.spacing.md, textAlign: 'center' },
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.sm, padding: theme.spacing.xl },
  deniedText: { color: theme.colors.textSecondary, fontSize: 14, textAlign: 'center' },
});
