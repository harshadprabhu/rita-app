import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { Screen } from './Screen';
import { AppHeader } from './AppHeader';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useAuthStore } from '../../stores/authStore';
import { signOut } from '../../lib/auth/session';
import { ROLE_LABELS } from '../../constants/roles';
import { theme } from '../../constants/theme';

export function ProfileScreen() {
  const { t } = useTranslation();
  const profile = useAuthStore((s) => s.profile);
  if (!profile) return null;

  return (
    <Screen>
      <AppHeader title={t('profile.title')} showBack />
      <View style={styles.body}>
        <Text variant="headlineSmall" style={styles.name}>{profile.display_name}</Text>
        <Text style={styles.role}>{ROLE_LABELS[profile.role]}</Text>

        <Row label={t('profile.store')} value={profile.store_name ?? profile.store_id ?? '-'} />
        <Row label={t('profile.phone')} value={profile.phone ?? '-'} />
        <Row label={t('profile.designation')} value={profile.designation ?? '-'} />

        <View style={styles.langRow}>
          <Text style={styles.label}>{t('profile.language')}</Text>
          <LanguageSwitcher />
        </View>

        <Button mode="outlined" onPress={signOut} style={styles.signOutBtn} textColor={theme.colors.error}>
          {t('common.signOut')}
        </Button>
      </View>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: theme.spacing.lg },
  name: { fontWeight: '700', color: theme.colors.textPrimary },
  role: { color: theme.colors.brandMid, fontWeight: '600', marginBottom: theme.spacing.lg },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: theme.spacing.sm, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  langRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: theme.spacing.sm },
  label: { color: theme.colors.textSecondary, fontSize: 13 },
  value: { color: theme.colors.textPrimary, fontWeight: '600', fontSize: 13 },
  signOutBtn: { marginTop: theme.spacing.xl, borderColor: theme.colors.error },
});
