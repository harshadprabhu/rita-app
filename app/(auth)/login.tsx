import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Screen } from '../../components/common/Screen';
import { signInWithPassword, requestOtp, verifyOtp } from '../../lib/auth/session';
import { isValidEmail } from '../../lib/utils/validation';
import { extractErrorMessage } from '../../lib/utils/error';
import { theme } from '../../constants/theme';

type Mode = 'password' | 'otp-request' | 'otp-verify';

export default function Login() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handlePasswordLogin = async () => {
    setError('');
    if (!isValidEmail(email)) { setError(t('auth.invalidEmail')); return; }
    if (!password) { setError(t('auth.passwordRequired')); return; }
    setLoading(true);
    const { error: authError } = await signInWithPassword(email, password);
    setLoading(false);
    if (authError) setError(extractErrorMessage(authError));
  };

  const handleSendOtp = async () => {
    setError('');
    if (!isValidEmail(email)) { setError(t('auth.invalidEmail')); return; }
    setLoading(true);
    const { error: otpError } = await requestOtp(email);
    setLoading(false);
    if (otpError) setError(extractErrorMessage(otpError));
    else setMode('otp-verify');
  };

  const handleVerifyOtp = async () => {
    setError('');
    if (!otp) { setError(t('auth.otpRequired')); return; }
    setLoading(true);
    const { error: verifyError } = await verifyOtp(email, otp);
    setLoading(false);
    if (verifyError) setError(extractErrorMessage(verifyError));
  };

  return (
    <Screen edges={['top', 'left', 'right']} style={styles.screen}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="always">
          <View style={styles.hero}>
            <View style={styles.logoContainer}>
              <MaterialCommunityIcons name="ticket-confirmation-outline" size={40} color="#fff" />
            </View>
            <Text style={styles.brand}>RITA</Text>
            <Text style={styles.subtitle}>{t('auth.subtitle')}</Text>
          </View>

          <View style={styles.card}>
            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Text style={styles.fieldLabel}>{t('auth.emailLabel')}</Text>
            <View style={styles.inputWrapper}>
              <MaterialCommunityIcons name="email-outline" size={20} color={theme.colors.brand} style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={mode !== 'otp-verify'}
                placeholder="your@email.com"
                placeholderTextColor={theme.colors.textTertiary}
              />
            </View>

            {mode === 'password' && (
              <>
                <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>{t('auth.passwordLabel')}</Text>
                <View style={styles.inputWrapper}>
                  <MaterialCommunityIcons name="lock-outline" size={20} color={theme.colors.brand} style={styles.inputIcon} />
                  <TextInput
                    style={styles.textInput}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPass}
                    autoCorrect={false}
                    placeholder="••••••••"
                    placeholderTextColor={theme.colors.textTertiary}
                  />
                  <TouchableOpacity onPress={() => setShowPass((v) => !v)} style={styles.eyeButton}>
                    <MaterialCommunityIcons name={showPass ? 'eye-off' : 'eye'} size={20} color={theme.colors.textSecondary} />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity onPress={handlePasswordLogin} disabled={loading} style={[styles.signInBtn, theme.shadows.md]} activeOpacity={0.85}>
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.signInBtnText}>{t('auth.signIn')}</Text>}
                </TouchableOpacity>

                <TouchableOpacity onPress={() => { setError(''); setMode('otp-request'); }} style={styles.linkBtn}>
                  <Text style={styles.linkText}>{t('auth.signInWithOtp')}</Text>
                </TouchableOpacity>
              </>
            )}

            {mode === 'otp-request' && (
              <>
                <TouchableOpacity onPress={handleSendOtp} disabled={loading} style={[styles.signInBtn, theme.shadows.md]} activeOpacity={0.85}>
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.signInBtnText}>{t('auth.sendOtp')}</Text>}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setError(''); setMode('password'); }} style={styles.linkBtn}>
                  <Text style={styles.linkText}>{t('auth.signInWithPassword')}</Text>
                </TouchableOpacity>
              </>
            )}

            {mode === 'otp-verify' && (
              <>
                <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>{t('auth.otpLabel')}</Text>
                <View style={styles.inputWrapper}>
                  <MaterialCommunityIcons name="shield-key-outline" size={20} color={theme.colors.brand} style={styles.inputIcon} />
                  <TextInput
                    style={styles.textInput}
                    value={otp}
                    onChangeText={setOtp}
                    keyboardType="number-pad"
                    placeholder="123456"
                    placeholderTextColor={theme.colors.textTertiary}
                  />
                </View>
                <TouchableOpacity onPress={handleVerifyOtp} disabled={loading} style={[styles.signInBtn, theme.shadows.md]} activeOpacity={0.85}>
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.signInBtnText}>{t('auth.verifyOtp')}</Text>}
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity onPress={() => router.push('/(auth)/register')} style={styles.linkBtn}>
              <Text style={styles.linkText}>{t('auth.register')}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: theme.colors.brand },
  scroll: { flexGrow: 1 },
  hero: {
    backgroundColor: theme.colors.brand,
    alignItems: 'center',
    paddingTop: theme.spacing.xxl * 2,
    paddingBottom: theme.spacing.xl + theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
  },
  logoContainer: {
    width: 84, height: 84, borderRadius: theme.radius.lg,
    backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center', marginBottom: theme.spacing.md,
  },
  brand: { color: '#fff', fontSize: 28, fontWeight: '700', letterSpacing: 1 },
  subtitle: { color: 'rgba(255,255,255,0.6)', fontSize: 14, marginTop: theme.spacing.xs },
  card: {
    flex: 1, backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg,
    marginTop: -theme.spacing.lg, zIndex: 2, padding: theme.spacing.xxl,
    paddingBottom: theme.spacing.xxl + theme.spacing.lg,
  },
  error: {
    color: '#EF4444', backgroundColor: '#FEE2E2', padding: theme.spacing.md,
    borderRadius: theme.radius.sm, marginBottom: theme.spacing.md, fontSize: 14,
  },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: theme.colors.textSecondary, letterSpacing: 0.8, marginBottom: theme.spacing.xs },
  fieldLabelSpaced: { marginTop: theme.spacing.lg },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.surface2,
    borderWidth: 1.5, borderColor: theme.colors.border, borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md, height: 50,
  },
  inputIcon: { marginRight: theme.spacing.sm },
  textInput: { flex: 1, color: theme.colors.textPrimary, fontSize: 15, paddingVertical: 0 },
  eyeButton: { padding: theme.spacing.xs, marginLeft: theme.spacing.xs },
  signInBtn: {
    backgroundColor: theme.colors.brand, borderRadius: theme.radius.md, height: 52,
    alignItems: 'center', justifyContent: 'center', marginTop: theme.spacing.xl, marginBottom: theme.spacing.sm,
  },
  signInBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  linkBtn: { alignItems: 'center', paddingVertical: theme.spacing.sm },
  linkText: { color: theme.colors.brandMid, fontSize: 14, fontWeight: '600' },
});
