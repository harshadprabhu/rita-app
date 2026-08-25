import '../global.css';
import '../lib/i18n';
import React, { useEffect, useRef, useState } from 'react';
import { Platform, Text as RNText, TextInput as RNTextInput } from 'react-native';
import { useFonts } from 'expo-font';
import { Stack, router, usePathname } from 'expo-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { PaperProvider, MD3LightTheme } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { useTranslation } from 'react-i18next';
import { loadSavedLanguage } from '../lib/i18n';
import { queryClient } from '../lib/queryClient';
import { supabase } from '../lib/supabase';
import { useUiStore } from '../stores/uiStore';
import { useAuth } from '../hooks/useAuth';
import { useUnifiedNotifications } from '../hooks/useUnifiedNotifications';
import { useAuthStore } from '../stores/authStore';
import { updatePushToken } from '../lib/api/profiles';
import { LoadingOverlay } from '../components/common/LoadingOverlay';
import { ToastHost } from '../components/common/ToastHost';
import { ErrorBoundary } from '../components/common/ErrorBoundary';

// Bricolage Grotesque — the app's brand typeface for all text.
// Inter — used only for numerical values (gold rates, ticket numbers, etc.).
// Loaded locally via expo-font (useFonts in RootLayout below) on every
// platform, including web. A Google Fonts CDN <link> used to be injected
// here too, but it registered the family under the CSS name "Bricolage
// Grotesque" (with a space) while every Text/TextInput below is forced
// (via defaultProps) to request "BricolageGrotesque" (no space) — the local
// useFonts name. The two names never matched, so the CDN font was never
// actually applied to any RN Text component; it just cost two preconnects
// plus a stylesheet + font fetch on every web load for no visual benefit.
// RITA is a plain SPA (no SSR/static HTML before hydration), so there was
// never any pre-JS content for it to style either. Removed.
const FONT_FAMILY = 'BricolageGrotesque';

// Set Bricolage Grotesque as the default font for all Text and TextInput.
// Each element gets fontFamily inline, which won't interfere with icon fonts
// (Ionicons etc.) that set their own fontFamily inline.
const textProps = (RNText as any).defaultProps || {};
(RNText as any).defaultProps = { ...textProps, style: [{ fontFamily: FONT_FAMILY }, textProps.style] };
const inputProps = (RNTextInput as any).defaultProps || {};
(RNTextInput as any).defaultProps = { ...inputProps, style: [{ fontFamily: FONT_FAMILY }, inputProps.style] };

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

  // Tapping an OS push notification deep-links into the relevant screen. The
  // push payload carries either a ticketId (→ ticket detail) or an explicit
  // route (→ that screen, e.g. the Alerts tab for broadcasts/gold updates).
  useEffect(() => {
    const openFrom = (resp: Notifications.NotificationResponse | null) => {
      const data = (resp?.notification?.request?.content?.data ?? {}) as { ticketId?: string; route?: string };
      if (data.ticketId) router.push(`/tickets/${data.ticketId}`);
      else if (typeof data.route === 'string' && data.route.startsWith('/')) router.push(data.route as never);
    };
    const sub = Notifications.addNotificationResponseReceivedListener(openFrom);
    // Cold start: app was launched by tapping a notification.
    Notifications.getLastNotificationResponseAsync().then(openFrom).catch(() => null);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      try {
        if (Platform.OS === 'android') {
          // TEMPORARY: the app crashes immediately after sign-in on the
          // standalone Android build, and it persisted even after an
          // earlier fix that only skipped getDevicePushTokenAsync() below —
          // proof the crash isn't necessarily (or isn't only) that call.
          // setNotificationChannelAsync() also touches native notification
          // APIs and was still running unconditionally before that skip, so
          // it's an equally live suspect. Skipping the ENTIRE Android
          // notifications branch (channel setup + push token registration)
          // until a real device crash log (adb logcat) pinpoints the actual
          // native failure — this trades notifications on Android for an
          // app that boots, which is the priority right now.
          console.warn('[push] Android notification setup temporarily disabled — see comment above');
          return;
        }
        const { status } = await Notifications.requestPermissionsAsync();
        if (status !== 'granted') return;
        // The *device* (raw FCM) token, not an Expo one: send-push talks to
        // FCM directly, so nothing routes through Expo's servers.
        const token = await Notifications.getDevicePushTokenAsync();
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

    if (!profile) {
      // Session exists but the profile isn't loaded yet (first-login race —
      // ensureProfile retries the read). Just keep showing the loading screen;
      // do NOT sign out here — the old aggressive sign-out flashed an error and
      // crashed the app on first login. The profile arrives moments later.
      return;
    }

    let dest: string;
    if (!profile.is_active) {
      dest = 'login'; // deactivated accounts are bounced back to login
    } else if (profile.role === 'technician' && profile.approval_status === 'pending') {
      dest = 'pending';
    } else if ((profile.role === 'user' || profile.role === 'in_store_manager') && profile.approval_status === 'approved') {
      // In-Store Manager uses the store-staff screens for now.
      // A missing store_id no longer routes to /select-store — that branch
      // was implicated in the Android crash-after-login (large SectionList
      // + Modal + KeyboardAvoidingView on some devices), and session.ts's
      // own contract already treats a store-less profile as "Head Office /
      // let them in" rather than a signup-blocker. Users who genuinely need
      // a store assignment can now be updated by an admin via the Accounts
      // screen instead of being trapped on a full-screen picker at login.
      dest = 'user';
    } else if ((profile.role === 'manager' || profile.role === 'ops_manager') && profile.approval_status === 'approved') {
      // Ops Manager uses the manager screens (+ promotions, gated in-screen).
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

    if (dest === 'user') router.replace('/(user)/home');
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
  // Only the Regular weight blocks first paint — every Text defaults to it
  // (see defaultProps above). The other weights/families load in the
  // background and just repaint once ready; gating the loading screen on
  // all 7 files made every cold start wait for the slowest of them (Inter,
  // ~325KB) even though 95% of the UI only needs the ~82KB Regular file.
  const [criticalFontLoaded] = useFonts({
    BricolageGrotesque: require('../assets/fonts/BricolageGrotesque-Regular.ttf'),
  });
  useFonts({
    'BricolageGrotesque-SemiBold': require('../assets/fonts/BricolageGrotesque-SemiBold.ttf'),
    'BricolageGrotesque-Bold': require('../assets/fonts/BricolageGrotesque-Bold.ttf'),
    'BricolageGrotesque-ExtraBold': require('../assets/fonts/BricolageGrotesque-ExtraBold.ttf'),
    InterNumeric: require('../assets/fonts/Inter-SemiBold.ttf'),
    // Indriya's own brand typeface (pulled from indriya.com), used only for
    // the same kind of prominent headline text it's used for on the site
    // (screen title bar, home greeting) — everything else stays Bricolage.
    BegumSans: require('../assets/fonts/BegumSans-Regular.otf'),
    'BegumSans-Medium': require('../assets/fonts/BegumSans-Medium.otf'),
  });
  const fontsLoaded = criticalFontLoaded;

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

  if (!langReady || !fontsLoaded) return <LoadingOverlay message="Loading..." />;

  return (
    <ErrorBoundary>
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
            <Stack.Screen name="select-store" />
            <Stack.Screen name="auth/callback" />
          </Stack>
          <AuthGate />
          <ToastHost />
        </SafeAreaProvider>
      </PaperProvider>
    </QueryClientProvider>
    </ErrorBoundary>
  );
}
