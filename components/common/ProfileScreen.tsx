import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Screen } from './Screen';
import { AppHeader } from './AppHeader';
import { MetalNavy } from './MetalNavy';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useAuthStore } from '../../stores/authStore';
import { signOut } from '../../lib/auth/session';
import { ROLE_LABELS } from '../../constants/roles';
import { theme } from '../../constants/theme';

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
  if (!profile) return null;

  const infoRows: { icon: keyof typeof Ionicons.glyphMap; value: string }[] = [
    { icon: 'business-outline', value: profile.store_name ?? profile.store_id ?? '—' },
    { icon: 'call-outline', value: profile.phone ?? '—' },
    { icon: 'briefcase-outline', value: profile.designation ?? '—' },
  ];

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
          {infoRows.map((r, i) => (
            <View key={i} style={[styles.infoRow, i > 0 && styles.infoDivider]}>
              <Ionicons name={r.icon} size={14} color={theme.colors.textTertiary} />
              <Text style={styles.infoValue} numberOfLines={1}>{r.value}</Text>
            </View>
          ))}
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
                <TouchableOpacity key={tool.label} style={[styles.tool, theme.shadows.xs]} onPress={tool.onPress} activeOpacity={0.8}>
                  <View style={[styles.toolIcon, { backgroundColor: tool.bg }]}>
                    <Ionicons name={tool.icon} size={13} color={tool.color} />
                  </View>
                  <Text style={styles.toolLabel} numberOfLines={1}>{tool.label}</Text>
                  <Ionicons name="chevron-forward" size={11} color={theme.colors.textTertiary} />
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* Sign out */}
        <TouchableOpacity style={styles.signOut} onPress={signOut} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={15} color={theme.colors.error} />
          <Text style={styles.signOutText}>{t('common.signOut')}</Text>
        </TouchableOpacity>

        <Text style={styles.version}>RITA · Indriya Jewellery</Text>
      </ScrollView>
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
  name: { fontSize: 19, fontWeight: '600', color: '#fff', fontFamily: theme.fonts.serif },
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
  version: { textAlign: 'center', fontSize: 9, color: theme.colors.textTertiary, marginTop: theme.spacing.xs },
});
