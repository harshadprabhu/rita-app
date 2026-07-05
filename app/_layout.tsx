import '../global.css';
import '../lib/i18n';
import React, { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { Stack, router, usePathname } from 'expo-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { PaperProvider, MD3LightTheme } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { useTranslation } from 'react-i18next';
import { loadSavedLanguage } from '../lib/i18n';
import { queryClient } from '../lib/queryClient';
import { useUiStore } from '../stores/uiStore';
import { useAuth } from '../hooks/useAuth';
import { useUnifiedNotifications } from '../hooks/useUnifiedNotifications';
import { useAuthStore } from '../stores/authStore';
import { updatePushToken } from '../lib/api/profiles';
import { LoadingOverlay } from '../components/common/LoadingOverlay';
import { ToastHost } from '../components/common/ToastHost';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#1B3A7A',
    secondary: '#1B3A7A',
  },
};

function AuthGate() {
  const { t } = useTranslation();
  useAuth();
  const pathname = usePathname();
  const session = useAuthStore((s) => s.session);
  const profile = useAuthStore((s) => s.profile);
  const isLoading = useAuthStore((s) => s.isLoading);

  // Guard against React Strict Mode double-invoking effects and re-firing the
  // same router.replace() twice (which can knock focus out of a TextInput).
  const lastNav = useRef<string | null>(null);

  // Fetch notifications + broadcasts globally so the bottom-bar badge reflects
  // both ticket alerts and announcement unread counts before the user opens the
  // Alerts tab. React Query caches results, so the tab reuses them for free.
  useUnifiedNotifications(profile?.id ?? '', profile?.store_id ?? null);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      try {
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'Default',
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#1B3A7A',
          });
        }
        const { status } = await Notifications.requestPermissionsAsync();
        if (status !== 'granted') return;
        const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
        const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
        await updatePushToken(profile.id, token.data).catch(() => null);
      } catch {
        // Push token registration is non-critical — never crash the app over it
      }
    })();
  }, [profile?.id]);

  useEffect(() => {
    if (isLoading) return;

    if (!session) {
      // The OAuth callback route is mid-exchange (code → session) when the app
      // boots there after the Microsoft redirect — yanking it to /login here
      // would abort the sign-in. It redirects itself when it's done or fails.
      if (pathname?.startsWith('/auth/callback')) return;
      if (lastNav.current !== 'login') {
        lastNav.current = 'login';
        router.replace('/(auth)/login');
      }
      return;
    }

    if (!profile) return;

    let dest: string;
    if (!profile.is_active) {
      dest = 'login'; // deactivated accounts are bounced back to login
    } else if (profile.role === 'user' && !profile.store_id) {
      // Microsoft SSO provisions a bare 'user' profile with no store — Azure
      // knows identity but not which store the person works at.
      dest = 'onboarding';
    } else if (profile.role === 'technician' && profile.approval_status === 'pending') {
      dest = 'pending';
    } else if (profile.role === 'user' && profile.approval_status === 'approved') {
      dest = 'user';
    } else if (profile.role === 'manager' && profile.approval_status === 'approved') {
      dest = 'manager';
    } else if (profile.role === 'technician' && profile.approval_status === 'approved') {
      dest = 'technician';
    } else if (profile.role === 'admin') {
      dest = 'admin';
    } else if (profile.approval_status === 'pending') {
      dest = 'pending';
    } else {
      dest = 'login';
    }

    if (lastNav.current === dest) return;
    lastNav.current = dest;

    if (dest === 'onboarding') router.replace('/onboarding-store');
    else if (dest === 'user') router.replace('/(user)/home');
    else if (dest === 'manager') router.replace('/(manager)/home');
    else if (dest === 'technician') router.replace('/(technician)/home');
    else if (dest === 'admin') router.replace('/(admin)/home');
    else if (dest === 'pending') router.replace('/pending-approval');
    else router.replace('/(auth)/login');
  }, [isLoading, session, profile, pathname]);

  if (isLoading) return <LoadingOverlay message={t('common.loading')} />;
  return null;
}

export default function RootLayout() {
  const [langReady, setLangReady] = useState(false);

  useEffect(() => {
    loadSavedLanguage().finally(() => setLangReady(true));
  }, []);

  // Web: Supabase reports OAuth sign-in failures by redirecting back with
  // ?error_description=… (query or hash) — and when the redirect URL isn't
  // recoverable it falls back to the Site URL *root*, so the error can land on
  // any page, not just /auth/callback. Sweep it up at boot wherever it lands,
  // stash it for the login screen's banner, and clean the URL.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const url = new URL(window.location.href);
    const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
    const message =
      url.searchParams.get('error_description') ?? hash.get('error_description') ??
      url.searchParams.get('error') ?? hash.get('error');
    if (!message) return;
    useUiStore.getState().setSsoError(message);
    for (const key of ['error', 'error_description', 'error_code']) url.searchParams.delete(key);
    window.history.replaceState(null, '', url.pathname + url.search);
  }, []);

  if (!langReady) return <LoadingOverlay message="Loading..." />;

  return (
    <QueryClientProvider client={queryClient}>
      <PaperProvider theme={theme}>
        <SafeAreaProvider>
          <StatusBar style="auto" backgroundColor="#1B3A7A" />
          <Stack screenOptions={{ headerShown: false, statusBarStyle: 'light' }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(user)" />
            <Stack.Screen name="(manager)" />
            <Stack.Screen name="(technician)" />
            <Stack.Screen name="(admin)" />
            <Stack.Screen name="tickets/[id]" options={{ presentation: 'card' }} />
            <Stack.Screen name="create-ticket" options={{ presentation: 'modal' }} />
            <Stack.Screen name="pending-approval" />
            <Stack.Screen name="onboarding-store" />
            <Stack.Screen name="auth/callback" />
          </Stack>
          <AuthGate />
          <ToastHost />
        </SafeAreaProvider>
      </PaperProvider>
    </QueryClientProvider>
  );
}
