import { useEffect, useState } from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { completeSessionFromCode } from '../../lib/auth/oauth';
import { useUiStore } from '../../stores/uiStore';
import { LoadingOverlay } from '../../components/common/LoadingOverlay';

/**
 * Lands the OAuth redirect — both the native deep link (rita://auth/callback)
 * and, on web, the full-page redirect back from Microsoft/Supabase
 * (https://…/auth/callback?code=…). The web sign-in deliberately uses a
 * full-page redirect instead of a popup (popups failed three different ways:
 * blockers, dropped postMessage, COOP-severed openers), so this route is the
 * single place the web session gets completed.
 *
 * On Android the redirect also leaks a deep link into the app even though the
 * sign-in helper already exchanges the code, so completion here must stay
 * idempotent (completeSessionFromCode short-circuits when a session exists).
 * Afterwards, bounce to '/' where AuthGate routes by role.
 */
export default function AuthCallback() {
  const { t } = useTranslation();
  const { code, error, error_description: errorDescription } =
    useLocalSearchParams<{ code?: string; error?: string; error_description?: string }>();
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        if (code) {
          await completeSessionFromCode(code);
        } else if (error || errorDescription) {
          throw new Error(decodeURIComponent(errorDescription ?? error ?? ''));
        }
      } catch (e) {
        // Android double-fire is benign (completeSessionFromCode already
        // swallows it when a session exists); a genuine failure must be shown,
        // not hidden. A toast survives the redirect to login — URL params
        // don't (AuthGate's replace() strips them).
        const message = e instanceof Error ? e.message : String(e);
        console.warn(`[auth/callback] sign-in completion failed: ${message}`);
        useUiStore.getState().showToast(`Microsoft sign-in failed: ${message}`, 'error');
      } finally {
        setDone(true);
      }
    })();
  }, [code, error, errorDescription]);

  if (done) return <Redirect href="/" />;
  return <LoadingOverlay message={t('common.loading')} />;
}
