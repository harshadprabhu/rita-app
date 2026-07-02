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
import { signInWithMicrosoft } from '../../lib/auth/oauth';
import { isValidEmail } from '../../lib/utils/validation';
import { extractErrorMessage } from '../../lib/utils/error';
import { theme, webNoOutline } from '../../constants/theme';

type Mode = 'password' | 'otp-request' | 'otp-verify';
type FieldName = 'email' | 'password' | 'otp';

export default function Login() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [msLoading, setMsLoading] = useState(false);
  const [focused, setFocused] = useState<FieldName | null>(null);

  const handleMicrosoftLogin = async () => {
    setError('');
    setMsLoading(true);
    try {
      await signInWithMicrosoft();
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setMsLoading(false);
    }
  };

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
            {/* Layered translucent circles simulate depth/glow without a gradient dependency */}
            <View style={styles.heroGlowLg} pointerEvents="none" />
            <View style={styles.heroGlowSm} pointerEvents="none" />
            <View style={[styles.logoContainer, theme.shadows.lg]}>
              <MaterialCommunityIcons name="ticket-confirmation-outline" size={40} color="#fff" />
            </View>
            <Text style={styles.brand}>RITA</Text>
            <Text style={styles.subtitle}>{t('auth.subtitle')}</Text>
          </View>

          <View style={[styles.card, theme.shadows.lg]}>
            {error ? (
              <View style={styles.errorRow}>
                <MaterialCommunityIcons name="alert-circle" size={16} color={theme.colors.errorStrong} />
                <Text style={styles.error}>{error}</Text>
              </View>
            ) : null}

            {/* Microsoft SSO — primary sign-in path */}
            <TouchableOpacity
              onPress={handleMicrosoftLogin}
              disabled={msLoading}
              style={[styles.msBtn, theme.shadows.sm, msLoading ? styles.signInBtnDisabled : null]}
              activeOpacity={0.85}
            >
              {msLoading
                ? <ActivityIndicator color={theme.colors.brand} />
                : (
                  <>
                    {/* Official Microsoft logo: four-color 2x2 grid */}
                    <View style={styles.msLogo}>
                      <View style={[styles.msSquare, { backgroundColor: '#F25022' }]} />
                      <View style={[styles.msSquare, { backgroundColor: '#7FBA00' }]} />
                      <View style={[styles.msSquare, { backgroundColor: '#00A4EF' }]} />
                      <View style={[styles.msSquare, { backgroundColor: '#FFB900' }]} />
                    </View>
                    <Text style={styles.msBtnText}>{t('auth.signInMicrosoft')}</Text>
                  </>
                )
              }
            </TouchableOpacity>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>{t('auth.or')}</Text>
              <View style={styles.dividerLine} />
            </View>

            <Text style={styles.fieldLabel}>{t('auth.emailLabel')}</Text>
            <View style={[styles.inputWrapper, focused === 'email' && styles.inputWrapperFocused]}>
              <MaterialCommunityIcons name="email-outline" size={20} color={theme.colors.brand} style={styles.inputIcon} />
              <TextInput
                style={[styles.textInput, webNoOutline]}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={mode !== 'otp-verify'}
                placeholder="your@email.com"
                placeholderTextColor={theme.colors.textTertiary}
                onFocus={() => setFocused('email')}
                onBlur={() => setFocused(null)}
              />
            </View>

            {mode === 'password' && (
              <>
                <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>{t('auth.passwordLabel')}</Text>
                <View style={[styles.inputWrapper, focused === 'password' && styles.inputWrapperFocused]}>
                  <MaterialCommunityIcons name="lock-outline" size={20} color={theme.colors.brand} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.textInput, webNoOutline]}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPass}
                    autoCorrect={false}
                    placeholder="••••••••"
                    placeholderTextColor={theme.colors.textTertiary}
                    onFocus={() => setFocused('password')}
                    onBlur={() => setFocused(null)}
                  />
                  <TouchableOpacity onPress={() => setShowPass((v) => !v)} style={styles.eyeButton}>
                    <MaterialCommunityIcons name={showPass ? 'eye-off' : 'eye'} size={20} color={theme.colors.textSecondary} />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity onPress={handlePasswordLogin} disabled={loading} style={[styles.signInBtn, theme.shadows.brand]} activeOpacity={0.85}>
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.signInBtnText}>{t('auth.signIn')}</Text>}
                </TouchableOpacity>

                <View style={styles.linkRow}>
                  <TouchableOpacity onPress={() => { setError(''); setMode('otp-request'); }} style={styles.linkBtnInline}>
                    <Text style={styles.linkText}>{t('auth.signInWithOtp')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => router.push('/(auth)/forgot-password')} style={styles.linkBtnInline}>
                    <Text style={styles.linkText}>{t('auth.forgotPasswordLink')}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {mode === 'otp-request' && (
              <>
                <TouchableOpacity onPress={handleSendOtp} disabled={loading} style={[styles.signInBtn, theme.shadows.brand]} activeOpacity={0.85}>
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
                <View style={[styles.inputWrapper, focused === 'otp' && styles.inputWrapperFocused]}>
                  <MaterialCommunityIcons name="shield-key-outline" size={20} color={theme.colors.brand} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.textInput, webNoOutline]}
                    value={otp}
                    onChangeText={setOtp}
                    keyboardType="number-pad"
                    placeholder="123456"
                    placeholderTextColor={theme.colors.textTertiary}
                    onFocus={() => setFocused('otp')}
                    onBlur={() => setFocused(null)}
                  />
                </View>
                <TouchableOpacity onPress={handleVerifyOtp} disabled={loading} style={[styles.signInBtn, theme.shadows.brand]} activeOpacity={0.85}>
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
    paddingBottom: theme.spacing.xl + theme.spacing.xl,
    paddingHorizontal: theme.spacing.lg,
    overflow: 'hidden',
  },
  heroGlowLg: {
    position: 'absolute', top: -80, right: -60, width: 220, height: 220,
    borderRadius: 110, backgroundColor: 'rgba(255,255,255,0.06)',
  },
  heroGlowSm: {
    position: 'absolute', bottom: -40, left: -30, width: 140, height: 140,
    borderRadius: 70, backgroundColor: theme.colors.accent + '1A',
  },
  logoContainer: {
    width: 84, height: 84, borderRadius: theme.radius.xl,
    backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center', marginBottom: theme.spacing.md,
  },
  brand: { color: '#fff', fontSize: 30, fontWeight: '800', letterSpacing: 1.2 },
  subtitle: { color: 'rgba(255,255,255,0.65)', fontSize: 14, marginTop: theme.spacing.xs, fontWeight: '500' },
  card: {
    flex: 1, backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.xxl, borderTopRightRadius: theme.radius.xxl,
    marginTop: -theme.spacing.xl, zIndex: 2, padding: theme.spacing.xxl,
    paddingBottom: theme.spacing.xxl + theme.spacing.lg,
  },
  errorRow: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm,
    backgroundColor: theme.colors.errorBg, padding: theme.spacing.md,
    borderRadius: theme.radius.md, marginBottom: theme.spacing.md,
    borderLeftWidth: 3, borderLeftColor: theme.colors.errorStrong,
  },
  error: { flex: 1, color: theme.colors.errorStrong, fontSize: 13, fontWeight: '600' },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: theme.colors.textSecondary, letterSpacing: 0.8, marginBottom: theme.spacing.xs },
  fieldLabelSpaced: { marginTop: theme.spacing.lg },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.surface2,
    borderWidth: 1.5, borderColor: theme.colors.border, borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md, height: 52,
  },
  inputWrapperFocused: {
    borderColor: theme.colors.brand, backgroundColor: theme.colors.surface,
  },
  inputIcon: { marginRight: theme.spacing.sm },
  textInput: { flex: 1, color: theme.colors.textPrimary, fontSize: 15, paddingVertical: 0 },
  eyeButton: { padding: theme.spacing.xs, marginLeft: theme.spacing.xs },
  signInBtn: {
    backgroundColor: theme.colors.brand, borderRadius: theme.radius.lg, height: 54,
    alignItems: 'center', justifyContent: 'center', marginTop: theme.spacing.xl, marginBottom: theme.spacing.sm,
  },
  signInBtnDisabled: { opacity: 0.75 },
  signInBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  linkBtn: { alignItems: 'center', paddingVertical: theme.spacing.sm },
  linkRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: theme.spacing.sm },
  linkBtnInline: { paddingVertical: theme.spacing.xs },
  linkText: { color: theme.colors.brandMid, fontSize: 14, fontWeight: '600' },
  msBtn: {
    flexDirection: 'row', gap: theme.spacing.sm, backgroundColor: theme.colors.surface,
    borderWidth: 1.5, borderColor: theme.colors.borderStrong, borderRadius: theme.radius.lg,
    height: 54, alignItems: 'center', justifyContent: 'center',
  },
  msBtnText: { color: theme.colors.textPrimary, fontSize: 16, fontWeight: '700' },
  msLogo: {
    width: 20, height: 20, flexDirection: 'row', flexWrap: 'wrap',
    justifyContent: 'space-between', alignContent: 'space-between',
  },
  msSquare: { width: 9, height: 9 },
  dividerRow: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm,
    marginTop: theme.spacing.lg, marginBottom: theme.spacing.xs,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: theme.colors.border },
  dividerText: { color: theme.colors.textTertiary, fontSize: 12, fontWeight: '600' },
});
