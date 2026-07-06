import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Platform, ScrollView, ActivityIndicator, Image,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Screen } from '../../components/common/Screen';
import { signInWithMicrosoft } from '../../lib/auth/oauth';
import { useUiStore } from '../../stores/uiStore';
import { extractErrorMessage } from '../../lib/utils/error';
import { theme } from '../../constants/theme';

/**
 * Sign-in is Microsoft (Entra ID) SSO only — every RITA user is an Aditya Birla
 * employee with an AD account, and their profile is auto-provisioned from the
 * D365 worker master on first sign-in, so no password/OTP/registration path
 * exists.
 */
export default function Login() {
  const { t } = useTranslation();
  const [error, setError] = useState('');
  const [msLoading, setMsLoading] = useState(false);

  // Surface an OAuth failure swept from the redirect URL at boot (see
  // app/_layout.tsx) in this screen's error banner, wherever it landed.
  const ssoError = useUiStore((s) => s.ssoError);
  useEffect(() => {
    if (!ssoError) return;
    setError(ssoError);
    useUiStore.getState().setSsoError(null);
  }, [ssoError]);

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

  return (
    <Screen edges={['top', 'left', 'right']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="always">
        <View style={styles.hero}>
          {/* Layered translucent circles simulate depth/glow without a gradient dependency */}
          <View style={styles.heroGlowLg} pointerEvents="none" />
          <View style={styles.heroGlowSm} pointerEvents="none" />
          <View style={[styles.logoCard, theme.shadows.lg]}>
            <Image source={require('../../assets/rita-logo.png')} style={styles.logoImage} resizeMode="contain" />
          </View>
          <Text style={styles.subtitle}>{t('auth.subtitle')}</Text>
        </View>

        <View style={[styles.card, theme.shadows.lg]}>
          {error ? (
            <View style={styles.errorRow}>
              <MaterialCommunityIcons name="alert-circle" size={16} color={theme.colors.errorStrong} />
              <Text style={styles.error}>{error}</Text>
            </View>
          ) : null}

          <Text style={styles.prompt}>{t('auth.ssoOnlyPrompt', { defaultValue: 'Sign in with your Aditya Birla account' })}</Text>

          <TouchableOpacity
            onPress={handleMicrosoftLogin}
            disabled={msLoading}
            style={[styles.msBtn, theme.shadows.sm, msLoading ? styles.msBtnDisabled : null]}
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

          <Text style={styles.hint}>{t('auth.ssoOnlyHint', { defaultValue: 'Your account and details are set up automatically from your employee record.' })}</Text>
        </View>
      </ScrollView>
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
  logoCard: {
    backgroundColor: '#fff', borderRadius: theme.radius.xl,
    paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md,
    marginBottom: theme.spacing.md, alignItems: 'center', justifyContent: 'center',
  },
  logoImage: { width: 200, height: 120 },
  subtitle: { color: 'rgba(255,255,255,0.75)', fontSize: 14, marginTop: theme.spacing.xs, fontWeight: '600' },
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
  prompt: {
    color: theme.colors.textPrimary, fontSize: 16, fontWeight: '700',
    textAlign: 'center', marginBottom: theme.spacing.lg,
  },
  msBtn: {
    flexDirection: 'row', gap: theme.spacing.sm, backgroundColor: theme.colors.surface,
    borderWidth: 1.5, borderColor: theme.colors.borderStrong, borderRadius: theme.radius.lg,
    height: 54, alignItems: 'center', justifyContent: 'center',
  },
  msBtnDisabled: { opacity: 0.75 },
  msBtnText: { color: theme.colors.textPrimary, fontSize: 16, fontWeight: '700' },
  msLogo: {
    width: 20, height: 20, flexDirection: 'row', flexWrap: 'wrap',
    justifyContent: 'space-between', alignContent: 'space-between',
  },
  msSquare: { width: 9, height: 9 },
  hint: {
    color: theme.colors.textTertiary, fontSize: 12, textAlign: 'center',
    marginTop: theme.spacing.lg, lineHeight: 18,
  },
});
