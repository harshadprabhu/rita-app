import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { completeSessionFromCode } from '../../lib/auth/oauth';
import { useUiStore } from '../../stores/uiStore';
import { LoadingOverlay } from '../../components/common/LoadingOverlay';

/**
 * Lands the OAuth redirect from Microsoft sign-in.
 *
 * Web: the full-page redirect returns here as /auth/callback?code=…, and
 * supabase-js has already started exchanging the code during client init
 * (detectSessionInUrl). This screen just waits for that to finish —
 * getSession() resolves after the client's initialization, exchange included
 * — then bounces to '/' where AuthGate routes by role.
 *
 * Native: lands the rita://auth/callback deep link. On Android the deep link
 * fires in addition to the sign-in helper resolving, so the exchange here is
 * idempotent (completeSessionFromCode short-circuits on an existing session).
 * Without this route expo-router would show its "Unmatched Route" screen.
 */
export default function AuthCallback() {
  const { t } = useTranslation();
  const { code, error, error_description: errorDescription } =
    useLocalSearchParams<{ code?: string; error?: string; error_description?: string }>();
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        if (error || errorDescription) {
          throw new Error(decodeURIComponent(errorDescription ?? error ?? ''));
        }
        if (Platform.OS === 'web') {
          // getSession() awaits the client's init, which includes the
          // automatic code exchange. No session afterwards = exchange failed.
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) throw new Error(t('auth.ssoNoSession', { defaultValue: 'sign-in could not be completed' }));
        } else if (code) {
          await completeSessionFromCode(code);
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.warn(`[auth/callback] sign-in failed: ${message}`);
        // A toast survives the redirect back to login; URL params don't.
        useUiStore.getState().showToast(`Microsoft sign-in failed: ${message}`, 'error');
      } finally {
        setDone(true);
      }
    })();
  }, [code, error, errorDescription, t]);

  if (done) return <Redirect href="/" />;
  return <LoadingOverlay message={t('common.loading')} />;
}
