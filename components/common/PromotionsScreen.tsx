import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Screen } from './Screen';
import { AppHeader } from './AppHeader';
import { SoftPress } from './SoftPress';
import { StoreSearchPicker } from '../admin/StoreSearchPicker';
import {
  getPromotions, createPromotion, deactivatePromotion, findOverlappingPromotions,
  truncateUnicode, PROMOTION_MAX_LEN, Promotion,
} from '../../lib/api/promotions';
import { getStores } from '../../lib/api/stores';
import { useAuthStore } from '../../stores/authStore';
import { canPushPromotions } from '../../constants/roles';
import { DbStore } from '../../types';
import { webNoOutline, theme } from '../../constants/theme';

const PROMOTIONS_KEY = ['promotions'];

function targetLabel(p: Pick<Promotion, 'target_store_id' | 'target_store_ids'>, stores: DbStore[]): string {
  const ids = p.target_store_ids?.length ? p.target_store_ids : (p.target_store_id ? [p.target_store_id] : []);
  if (!ids.length) return 'All stores';
  if (ids.length === 1) return stores.find((s) => s.id === ids[0])?.name ?? '1 store';
  return `${ids.length} stores`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Ops Manager promotions: any number of short lines (scheme / offer), each
 * targeted at specific stores/regions or all of them, shown on the gold-rate
 * poster. A store can only ever show one ACTIVE promotion at a time, so
 * publishing warns (rather than silently double-booking) when the chosen
 * stores already have an overlapping active promotion. Deactivating keeps the
 * row in history — it never gets deleted.
 */
export function PromotionsScreen() {
  const profile = useAuthStore((s) => s.profile);
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [targetStoreIds, setTargetStoreIds] = useState<string[]>([]); // [] = all stores

  const allowed = !!profile && canPushPromotions(profile.role);

  const { data: promotions, isLoading } = useQuery({
    queryKey: PROMOTIONS_KEY,
    queryFn: getPromotions,
    enabled: allowed,
  });
  const { data: stores } = useQuery({ queryKey: ['stores'], queryFn: getStores, enabled: allowed });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: PROMOTIONS_KEY });
    qc.invalidateQueries({ queryKey: ['activePromotion'] });
  };

  const publish = useMutation({
    mutationFn: (body: string) => createPromotion(profile!.id, body, targetStoreIds),
    onSuccess: () => {
      setText('');
      setTargetStoreIds([]);
      invalidate();
    },
  });

  const deactivate = useMutation({
    mutationFn: (id: string) => deactivatePromotion(id),
    onSuccess: invalidate,
  });

  const handlePublish = async () => {
    const body = text.trim();
    if (!body) return;
    try {
      const overlaps = await findOverlappingPromotions(targetStoreIds);
      if (overlaps.length) {
        const names = overlaps.map((o) => `#${o.seq} (${targetLabel(o, stores ?? [])}) — "${o.body}"`).join('\n');
        Alert.alert(
          'Overlapping promotion',
          `${targetStoreIds.length ? 'These stores already have' : 'All stores already have'} an active promotion:\n\n${names}\n\nDeactivate ${overlaps.length > 1 ? 'them' : 'it'} and publish this one instead?`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Deactivate & publish',
              style: 'destructive',
              onPress: async () => {
                await Promise.all(overlaps.map((o) => deactivatePromotion(o.id)));
                publish.mutate(body);
              },
            },
          ],
        );
        return;
      }
      publish.mutate(body);
    } catch (e) {
      Alert.alert('Could not check for overlaps', String(e));
    }
  };

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

  // Unicode-safe length: `.length` overcounts surrogate-pair characters
  // (emoji etc.), which would show a wrong remaining-count and let the input
  // truncate mid-character.
  const remaining = PROMOTION_MAX_LEN - Array.from(text).length;

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader title="Promotions" subtitle="SHOWN ON THE GOLD RATE POSTER" showBack />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {/* Compose */}
        <View style={styles.labelRow}>
          <Text style={styles.label}>NEW PROMOTION</Text>
          <Text style={[styles.counter, remaining < 0 && { color: theme.colors.error }]}>{remaining}</Text>
        </View>
        <TextInput
          style={[styles.input, webNoOutline]}
          value={text}
          onChangeText={(t) => setText(truncateUnicode(t, PROMOTION_MAX_LEN))}
          placeholder="e.g. 10% off on all making charges this festive season"
          placeholderTextColor={theme.colors.textTertiary}
          multiline
        />
        <Text style={styles.hint}>Keep it short — it prints as one line or two on the poster (max {PROMOTION_MAX_LEN} characters).</Text>

        <Text style={[styles.label, styles.spaced]}>WHERE TO SHOW IT</Text>
        <StoreSearchPicker
          stores={stores ?? []}
          multiple
          selectedIds={targetStoreIds}
          onMultiSelect={setTargetStoreIds}
        />

        <SoftPress
          style={[styles.publishBtn, (!text.trim() || publish.isPending) && styles.publishBtnDisabled]}
          onPress={handlePublish}
          disabled={!text.trim() || publish.isPending}
        >
          {publish.isPending ? <ActivityIndicator color={theme.colors.textPrimary} /> : (
            <>
              <Ionicons name="megaphone" size={15} color={theme.colors.textPrimary} />
              <Text style={styles.publishText}>Publish Promotion</Text>
            </>
          )}
        </SoftPress>
        {publish.isError && <Text style={styles.error}>{String(publish.error)}</Text>}

        {/* List — all promotions, active first, most recent first within each */}
        <Text style={[styles.label, styles.spaced]}>ALL PROMOTIONS</Text>
        {isLoading ? (
          <ActivityIndicator color={theme.colors.accent} style={{ marginTop: theme.spacing.lg }} />
        ) : !promotions?.length ? (
          <Text style={styles.currentEmpty}>No promotions published yet.</Text>
        ) : (
          <View style={styles.list}>
            {promotions.map((p) => (
              <View key={p.id} style={[styles.promoCard, !p.is_active && styles.promoCardInactive]}>
                <View style={styles.promoTop}>
                  <Text style={styles.promoSeq}>#{p.seq}</Text>
                  <View style={[styles.statusPill, p.is_active ? styles.statusActive : styles.statusInactive]}>
                    <Text style={[styles.statusText, p.is_active ? styles.statusTextActive : styles.statusTextInactive]}>
                      {p.is_active ? 'Active' : 'Inactive'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.promoBody}>{p.body}</Text>
                <View style={styles.promoMetaRow}>
                  <Ionicons name="business-outline" size={11} color={theme.colors.textTertiary} />
                  <Text style={styles.promoMeta}>{targetLabel(p, stores ?? [])}</Text>
                </View>
                <View style={styles.promoMetaRow}>
                  <Ionicons name="calendar-outline" size={11} color={theme.colors.textTertiary} />
                  <Text style={styles.promoMeta}>
                    Activated {formatDate(p.activated_at)}
                    {p.deactivated_at ? ` · Deactivated ${formatDate(p.deactivated_at)}` : ''}
                  </Text>
                </View>
                {p.is_active && (
                  <SoftPress
                    style={styles.deactivateBtn}
                    onPress={() => Alert.alert('Deactivate promotion', `Stop showing #${p.seq} on the poster?`, [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Deactivate', style: 'destructive', onPress: () => deactivate.mutate(p.id) },
                    ])}
                    disabled={deactivate.isPending}
                  >
                    <Text style={styles.deactivateText}>Deactivate</Text>
                  </SoftPress>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl },
  label: { fontSize: 10, fontWeight: '800', color: theme.colors.textTertiary, letterSpacing: 1 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  spaced: { marginTop: theme.spacing.xl },
  counter: { fontSize: 11, fontWeight: '700', color: theme.colors.textTertiary },
  currentEmpty: { fontSize: 13, color: theme.colors.textTertiary, fontStyle: 'italic', marginTop: theme.spacing.sm },
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
  error: { color: theme.colors.error, fontSize: 13, marginTop: theme.spacing.md, textAlign: 'center' },
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.sm, padding: theme.spacing.xl },
  deniedText: { color: theme.colors.textSecondary, fontSize: 14, textAlign: 'center' },

  list: { marginTop: theme.spacing.sm, gap: theme.spacing.sm },
  promoCard: {
    backgroundColor: theme.colors.accentLight, borderWidth: 1, borderColor: theme.colors.accent + '55',
    borderRadius: theme.radius.md, padding: theme.spacing.md, gap: 4,
  },
  promoCardInactive: { backgroundColor: theme.colors.surface2, borderColor: theme.colors.border },
  promoTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  promoSeq: { fontSize: 11, fontWeight: '800', color: theme.colors.textTertiary, letterSpacing: 0.5 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: theme.radius.full },
  statusActive: { backgroundColor: '#ECFDF5' },
  statusInactive: { backgroundColor: theme.colors.surface },
  statusText: { fontSize: 10, fontWeight: '800' },
  statusTextActive: { color: '#059669' },
  statusTextInactive: { color: theme.colors.textTertiary },
  promoBody: { fontSize: 14, fontWeight: '700', color: theme.colors.textPrimary, marginTop: 2 },
  promoMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  promoMeta: { fontSize: 11, color: theme.colors.textTertiary, fontWeight: '600' },
  deactivateBtn: { alignSelf: 'flex-start', marginTop: 4, paddingVertical: 4 },
  deactivateText: { color: theme.colors.error, fontSize: 12, fontWeight: '700' },
});
