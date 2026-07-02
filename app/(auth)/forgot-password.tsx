import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Screen } from '../../components/common/Screen';
import { AppHeader } from '../../components/common/AppHeader';
import { supabase } from '../../lib/supabase';
import { isValidEmail } from '../../lib/utils/validation';
import { extractErrorMessage } from '../../lib/utils/error';
import { theme, webNoOutline } from '../../constants/theme';

export default function ForgotPassword() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleReset = async () => {
    if (!isValidEmail(email)) { setError(t('auth.invalidEmail')); return; }
    setError('');
    setLoading(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email);
    setLoading(false);
    if (err) { setError(extractErrorMessage(err)); return; }
    setSent(true);
  };

  if (sent) {
    return (
      <Screen>
        <AppHeader title={t('forgotPassword.title')} showBack />
        <View style={styles.successContainer}>
          <View style={styles.successIconRing}>
            <MaterialCommunityIcons name="email-check-outline" size={40} color={theme.colors.brand} />
          </View>
          <Text style={styles.successTitle}>{t('forgotPassword.checkEmailTitle')}</Text>
          <Text style={styles.successBody}>{t('forgotPassword.checkEmailBody', { email })}</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader title={t('forgotPassword.title')} showBack />
      <View style={styles.container}>
        <Text style={styles.subtitle}>{t('forgotPassword.subtitle')}</Text>
        {error ? (
          <View style={styles.errorRow}>
            <MaterialCommunityIcons name="alert-circle" size={16} color={theme.colors.errorStrong} />
            <Text style={styles.error}>{error}</Text>
          </View>
        ) : null}

        <Text style={styles.fieldLabel}>{t('forgotPassword.emailLabel')}</Text>
        <View style={[styles.inputWrapper, focused && styles.inputWrapperFocused]}>
          <MaterialCommunityIcons name="email-outline" size={20} color={theme.colors.brand} style={styles.inputIcon} />
          <TextInput
            style={[styles.textInput, webNoOutline]}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="your@email.com"
            placeholderTextColor={theme.colors.textTertiary}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          />
        </View>

        <TouchableOpacity onPress={handleReset} disabled={loading} style={[styles.btn, theme.shadows.brand]} activeOpacity={0.85}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>{t('forgotPassword.sendResetLink')}</Text>}
        </TouchableOpacity>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: theme.spacing.xxl,
  },
  subtitle: {
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xl,
    lineHeight: 22,
    fontSize: 14,
  },
  errorRow: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm,
    backgroundColor: theme.colors.errorBg, padding: theme.spacing.md,
    borderRadius: theme.radius.md, marginBottom: theme.spacing.md,
    borderLeftWidth: 3, borderLeftColor: theme.colors.errorStrong,
  },
  error: { flex: 1, color: theme.colors.errorStrong, fontSize: 13, fontWeight: '600' },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: theme.colors.textSecondary, letterSpacing: 0.8, marginBottom: theme.spacing.xs },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.surface2,
    borderWidth: 1.5, borderColor: theme.colors.border, borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md, height: 52, marginBottom: theme.spacing.lg,
  },
  inputWrapperFocused: { borderColor: theme.colors.brand, backgroundColor: theme.colors.surface },
  inputIcon: { marginRight: theme.spacing.sm },
  textInput: { flex: 1, color: theme.colors.textPrimary, fontSize: 15, paddingVertical: 0 },
  btn: {
    backgroundColor: theme.colors.brand, borderRadius: theme.radius.lg, height: 54,
    alignItems: 'center', justifyContent: 'center',
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  successContainer: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: theme.spacing.lg * 2, gap: theme.spacing.md,
  },
  successIconRing: {
    width: 84, height: 84, borderRadius: 42, backgroundColor: theme.colors.surface2,
    borderWidth: 1, borderColor: theme.colors.border,
    alignItems: 'center', justifyContent: 'center', marginBottom: theme.spacing.sm,
  },
  successTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.textPrimary, textAlign: 'center' },
  successBody: { color: theme.colors.textSecondary, textAlign: 'center', lineHeight: 20, fontSize: 14 },
});
