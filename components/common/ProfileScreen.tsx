import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Modal, Pressable, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Screen } from './Screen';
import { AppHeader } from './AppHeader';
import { MetalNavy } from './MetalNavy';
import { SoftPress } from './SoftPress';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useAuthStore } from '../../stores/authStore';
import { useUiStore } from '../../stores/uiStore';
import { updateProfile } from '../../lib/api/profiles';
import { signOut } from '../../lib/auth/session';
import { ROLE_LABELS } from '../../constants/roles';
import { theme, webNoOutline } from '../../constants/theme';

export interface ProfileTool {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  bg: string;
  onPress: () => void;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '·';
}

export function ProfileScreen({ tools, toolsTitle = 'Tools' }: { tools?: ProfileTool[]; toolsTitle?: string }) {
  const { t } = useTranslation();
  const profile = useAuthStore((s) => s.profile);
  const setProfile = useAuthStore((s) => s.setProfile);
  const showToast = useUiStore((s) => s.showToast);
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneDraft, setPhoneDraft] = useState('');

  // Technicians expose a phone so users can call them from Connect; anyone can
  // set theirs. Saved straight to the profile.
  const savePhone = useMutation({
    mutationFn: (phone: string) => updateProfile(profile!.id, { phone: phone || null }),
    onSuccess: (updated) => {
      setProfile({ ...profile!, phone: updated.phone });
      setEditingPhone(false);
      showToast('Phone number updated', 'success');
    },
    onError: (e) => showToast(e instanceof Error ? e.message : 'Could not save', 'error'),
  });

  if (!profile) return null;

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader title={t('profile.title')} showBack />

      {/* Navy hero with avatar */}
      <MetalNavy edge="bottom" style={styles.hero}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(profile.display_name)}</Text>
        </View>
        <View style={styles.heroText}>
          <Text style={styles.name} numberOfLines={1}>{profile.display_name}</Text>
          <View style={styles.badgeRow}>
            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>{ROLE_LABELS[profile.role].toUpperCase()}</Text>
            </View>
            <Text style={styles.org}>Indriya Jewellery</Text>
          </View>
        </View>
      </MetalNavy>

      <ScrollView contentContainerStyle={styles.body}>
        {/* Info card */}
        <View style={[styles.card, theme.shadows.xs]}>
          <View style={styles.infoRow}>
            <Ionicons name="business-outline" size={14} color={theme.colors.textTertiary} />
            <Text style={styles.infoValue} numberOfLines={1}>{profile.store_name ?? profile.store_id ?? '—'}</Text>
          </View>

          {/* Editable phone — tap to set/change. */}
          <TouchableOpacity
            style={[styles.infoRow, styles.infoDivider]}
            activeOpacity={0.7}
            onPress={() => { setPhoneDraft(profile.phone ?? ''); setEditingPhone(true); }}
          >
            <Ionicons name="call-outline" size={14} color={theme.colors.textTertiary} />
            <Text style={[styles.infoValue, !profile.phone && { color: theme.colors.textTertiary }]} numberOfLines={1}>
              {profile.phone ?? 'Add phone number'}
            </Text>
            <Ionicons name="pencil" size={13} color={theme.colors.brand} />
          </TouchableOpacity>

          <View style={[styles.infoRow, styles.infoDivider]}>
            <Ionicons name="briefcase-outline" size={14} color={theme.colors.textTertiary} />
            <Text style={styles.infoValue} numberOfLines={1}>{profile.designation ?? '—'}</Text>
          </View>
        </View>

        {/* Language */}
        <Text style={styles.sectionLabel}>{t('profile.language').toUpperCase()}</Text>
        <View style={[styles.card, styles.langCard, theme.shadows.xs]}>
          <LanguageSwitcher />
        </View>

        {/* Tools grid */}
        {tools && tools.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>{toolsTitle.toUpperCase()}</Text>
            <View style={styles.toolsGrid}>
              {tools.map((tool) => (
                <SoftPress key={tool.label} style={[styles.tool, theme.shadows.xs]} onPress={tool.onPress}>
                  <View style={[styles.toolIcon, { backgroundColor: tool.bg }]}>
                    <Ionicons name={tool.icon} size={13} color={tool.color} />
                  </View>
                  <Text style={styles.toolLabel} numberOfLines={1}>{tool.label}</Text>
                  <Ionicons name="chevron-forward" size={11} color={theme.colors.textTertiary} />
                </SoftPress>
              ))}
            </View>
          </>
        )}

        {/* Sign out */}
        <SoftPress style={styles.signOut} onPress={signOut}>
          <Ionicons name="log-out-outline" size={15} color={theme.colors.error} />
          <Text style={styles.signOutText}>{t('common.signOut')}</Text>
        </SoftPress>

        <Text style={styles.version}>RITA · Indriya Jewellery</Text>
      </ScrollView>

      <Modal visible={editingPhone} transparent animationType="fade" onRequestClose={() => setEditingPhone(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setEditingPhone(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Phone number</Text>
            <Text style={styles.modalHint}>Users can call you from “Connect with IT”. 10 digits.</Text>
            <TextInput
              style={[styles.modalInput, webNoOutline]}
              value={phoneDraft}
              onChangeText={(t) => setPhoneDraft(t.replace(/\D/g, '').slice(0, 10))}
              placeholder="10-digit phone"
              placeholderTextColor={theme.colors.textTertiary}
              keyboardType="number-pad"
              maxLength={10}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setEditingPhone(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSave, phoneDraft.length > 0 && phoneDraft.length !== 10 && { opacity: 0.5 }]}
                disabled={savePhone.isPending || (phoneDraft.length > 0 && phoneDraft.length !== 10)}
                onPress={() => savePhone.mutate(phoneDraft)}
              >
                {savePhone.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalSaveText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.lg },
  avatar: {
    width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center',
    backgroundColor: theme.colors.accent,
  },
  avatarText: { fontSize: 18, fontWeight: '800', color: theme.colors.textPrimary },
  heroText: { flex: 1 },
  name: { fontSize: 19, fontWeight: '600', color: '#fff' },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginTop: 4 },
  roleBadge: {
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: theme.radius.full,
    backgroundColor: 'rgba(200,150,62,0.22)', borderWidth: 1, borderColor: 'rgba(200,150,62,0.4)',
  },
  roleBadgeText: { fontSize: 9, fontWeight: '800', color: theme.colors.accentBright, letterSpacing: 0.5 },
  org: { fontSize: 10, color: 'rgba(255,255,255,0.4)' },

  body: { padding: theme.spacing.lg, gap: theme.spacing.md },
  card: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border, overflow: 'hidden' },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, paddingHorizontal: 14, paddingVertical: 11 },
  infoDivider: { borderTopWidth: 1, borderTopColor: theme.colors.border },
  infoValue: { fontSize: 12, fontWeight: '600', color: theme.colors.textPrimary, flex: 1 },

  sectionLabel: { fontSize: 9, fontWeight: '800', color: theme.colors.textTertiary, letterSpacing: 1.6, marginBottom: -4, marginLeft: 2 },
  langCard: { paddingHorizontal: 14, paddingVertical: 10 },

  toolsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  tool: {
    flexBasis: '47%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  toolIcon: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  toolLabel: { flex: 1, fontSize: 11.5, fontWeight: '700', color: theme.colors.textPrimary },

  signOut: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.sm,
    backgroundColor: theme.colors.errorLight, borderWidth: 1, borderColor: theme.colors.errorBorder,
    borderRadius: theme.radius.md, paddingVertical: 11, marginTop: theme.spacing.xs,
  },
  signOutText: { fontSize: 12, fontWeight: '700', color: theme.colors.error },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl },
  modalCard: { width: '100%', maxWidth: 360, backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, padding: theme.spacing.lg },
  modalTitle: { fontSize: 16, fontWeight: '800', color: theme.colors.textPrimary },
  modalHint: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 4, marginBottom: theme.spacing.md, lineHeight: 17 },
  modalInput: { backgroundColor: theme.colors.surface2, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, paddingHorizontal: theme.spacing.md, height: 46, color: theme.colors.textPrimary, fontSize: 16 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: theme.spacing.sm, marginTop: theme.spacing.lg },
  modalCancel: { paddingHorizontal: theme.spacing.lg, paddingVertical: 10, borderRadius: 8 },
  modalCancelText: { fontSize: 14, fontWeight: '700', color: theme.colors.textSecondary },
  modalSave: { paddingHorizontal: theme.spacing.xl, paddingVertical: 10, borderRadius: 8, backgroundColor: theme.colors.brand, minWidth: 84, alignItems: 'center' },
  modalSaveText: { fontSize: 14, fontWeight: '800', color: '#fff' },
  version: { textAlign: 'center', fontSize: 9, color: theme.colors.textTertiary, marginTop: theme.spacing.xs },
});
