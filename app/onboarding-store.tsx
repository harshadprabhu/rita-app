import React, { useState, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator,
  StyleSheet, FlatList, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getStores } from '../lib/api/stores';
import { updateProfile } from '../lib/api/profiles';
import { useAuthStore } from '../stores/authStore';
import { extractErrorMessage } from '../lib/utils/error';
import { DbStore } from '../types';
import { theme } from '../constants/theme';

/**
 * First-login onboarding for SSO users. Microsoft provides identity (name,
 * email) but not where the person works, so a freshly-provisioned 'user'
 * profile with no store_id lands here to pick their store (which carries the
 * store code and location) and optionally add a mobile number. Once saved,
 * the profile is complete — no further registration — and AuthGate routes home.
 */
export default function OnboardingStore() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const session = useAuthStore((s) => s.session);
  const profile = useAuthStore((s) => s.profile);
  const setProfile = useAuthStore((s) => s.setProfile);

  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobile, setMobile] = useState('');
  const [saving, setSaving] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState('');

  const { data: stores, isLoading } = useQuery({
    queryKey: ['stores'],
    queryFn: getStores,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return stores ?? [];
    return (stores ?? []).filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        (s.city ?? '').toLowerCase().includes(q),
    );
  }, [stores, search]);

  const selectedStore = stores?.find((s) => s.id === selectedId);

  const handleSave = async () => {
    const userId = session?.user?.id;
    if (!selectedId || !userId || !selectedStore) return;
    setError('');

    // Mobile is optional, but if provided it must look like a phone number.
    const trimmedMobile = mobile.replace(/[\s-]/g, '');
    if (trimmedMobile && !/^\+?\d{7,15}$/.test(trimmedMobile)) {
      setError(t('onboarding.invalidMobile'));
      return;
    }

    setSaving(true);
    try {
      const updated = await updateProfile(userId, {
        store_id: selectedId,
        store_name: selectedStore.name,
        store_location: selectedStore.city,
        phone: trimmedMobile || null,
      });
      setProfile(updated); // triggers AuthGate to route to user home
    } catch (e) {
      setError(extractErrorMessage(e));
      setSaving(false);
    }
  };

  // Self-register as a technician: flip this SSO user profile to a pending
  // technician. AuthGate then routes to /pending-approval and the profile shows
  // up in the admin approvals list until approved.
  const submitTechnician = async () => {
    const userId = session?.user?.id;
    if (!userId) return;
    setError('');
    setRegistering(true);
    try {
      const updated = await updateProfile(userId, {
        role: 'technician',
        approval_status: 'pending',
      });
      setProfile(updated); // triggers AuthGate to route to pending-approval
    } catch (e) {
      setError(extractErrorMessage(e));
      setRegistering(false);
    }
  };

  const handleRegisterTechnician = () => {
    Alert.alert(
      t('onboarding.confirmTitle'),
      t('onboarding.confirmBody'),
      [
        { text: t('onboarding.cancel'), style: 'cancel' },
        { text: t('onboarding.confirmCta'), onPress: submitTechnician },
      ],
    );
  };

  const renderItem = ({ item }: { item: DbStore }) => {
    const selected = item.id === selectedId;
    return (
      <TouchableOpacity
        style={[styles.storeRow, selected && styles.storeRowSelected]}
        onPress={() => setSelectedId(item.id)}
        activeOpacity={0.7}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.storeName}>{item.name}</Text>
          <Text style={styles.storeMeta}>
            {item.code}{item.city ? ` · ${item.city}` : ''}
          </Text>
        </View>
        {selected ? (
          <Ionicons name="checkmark-circle" size={22} color={theme.colors.brand} />
        ) : (
          <Ionicons name="ellipse-outline" size={22} color={theme.colors.border} />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + theme.spacing.md }]}>
        <Text style={styles.headerTitle}>
          {t('onboarding.greeting', { name: profile?.display_name ?? '' })}
        </Text>
        <Text style={styles.headerSubtitle}>{t('onboarding.selectStorePrompt')}</Text>
      </View>

      <View style={styles.body}>
        {error ? <Text style={styles.errorBanner}>{error}</Text> : null}

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color={theme.colors.textTertiary} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder={t('onboarding.searchPlaceholder')}
            placeholderTextColor={theme.colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {isLoading ? (
          <ActivityIndicator style={{ marginTop: theme.spacing.xl }} color={theme.colors.brand} />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(s) => s.id}
            renderItem={renderItem}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <Text style={styles.emptyText}>{t('onboarding.noStores')}</Text>
            }
          />
        )}
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + theme.spacing.md }]}>
        <View style={styles.mobileWrap}>
          <Ionicons name="call-outline" size={18} color={theme.colors.textTertiary} />
          <TextInput
            style={styles.mobileInput}
            value={mobile}
            onChangeText={setMobile}
            placeholder={t('onboarding.mobilePlaceholder')}
            placeholderTextColor={theme.colors.textTertiary}
            keyboardType="phone-pad"
            autoCorrect={false}
            maxLength={16}
          />
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, theme.shadows.md, (!selectedId || saving || registering) && styles.submitBtnDisabled]}
          onPress={handleSave}
          disabled={!selectedId || saving || registering}
          activeOpacity={0.85}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.submitBtnText}>{t('onboarding.continue')}</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.techLink}
          onPress={handleRegisterTechnician}
          disabled={saving || registering}
          activeOpacity={0.7}
        >
          {registering ? (
            <ActivityIndicator color={theme.colors.brand} />
          ) : (
            <Text style={styles.techLinkText}>
              {t('onboarding.technicianPrompt')}{' '}
              <Text style={styles.techLinkAction}>{t('onboarding.registerTechnician')}</Text>
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  header: {
    backgroundColor: theme.colors.brand,
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.lg,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    marginTop: theme.spacing.xs,
  },
  body: {
    flex: 1,
    padding: theme.spacing.lg,
  },
  errorBanner: {
    color: theme.colors.error,
    backgroundColor: theme.colors.errorBg,
    padding: theme.spacing.md,
    borderRadius: theme.radius.sm,
    marginBottom: theme.spacing.md,
    fontSize: 14,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  searchInput: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: 15,
    padding: 0,
  },
  listContent: {
    paddingBottom: theme.spacing.lg,
  },
  storeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  storeRowSelected: {
    borderColor: theme.colors.brand,
  },
  storeName: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  storeMeta: {
    color: theme.colors.textTertiary,
    fontSize: 13,
    marginTop: 2,
  },
  emptyText: {
    color: theme.colors.textTertiary,
    textAlign: 'center',
    marginTop: theme.spacing.xl,
    fontSize: 14,
  },
  footer: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.bg,
  },
  mobileWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  mobileInput: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: 15,
    padding: 0,
  },
  submitBtn: {
    backgroundColor: theme.colors.brand,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md + theme.spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  techLink: {
    marginTop: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  techLinkText: {
    color: theme.colors.textTertiary,
    fontSize: 14,
  },
  techLinkAction: {
    color: theme.colors.brand,
    fontWeight: '700',
  },
});
