import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { completeSessionFromCode } from '../../lib/auth/oauth';
import { LoadingOverlay } from '../../components/common/LoadingOverlay';

/**
 * Lands the OAuth redirect deep link (rita://auth/callback?code=…). On Android
 * the Microsoft sign-in redirect leaks a deep link into the app even though the
 * helper already exchanges the code; without this route expo-router would show
 * its "Unmatched Route" screen. We idempotently finish the session, then bounce
 * to '/' where AuthGate routes by role.
 *
 * On web this route also loads inside the popup lib/auth/oauth.ts opens (the
 * whole app boots fresh there). If it tried to complete the session itself,
 * it would race the opener's own completion attempt over the same single-use
 * PKCE code — whichever lost failed silently. So when running as a popup, just
 * hand the result back via postMessage; only the opener ever exchanges the
 * code. We deliberately do NOT call window.close() here — browsers routinely
 * drop a postMessage when the sending window closes in the same tick, which
 * silently loses the code ("pops up and closes, nothing happens"). The opener
 * closes the popup once it has actually received the message.
 */
export default function AuthCallback() {
  const { t } = useTranslation();
  const { code, error, error_description: errorDescription } =
    useLocalSearchParams<{ code?: string; error?: string; error_description?: string }>();
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web' && window.opener && window.opener !== window) {
      const message = {
        ritaOAuth: code ? { code } : { error: error ?? errorDescription ?? 'unknown_error' },
      };
      // Post now and again shortly after, in case the opener's listener wasn't
      // attached yet. The opener closes this popup once it has the message.
      window.opener.postMessage(message, window.location.origin);
      const retry = setInterval(() => {
        if (window.opener) window.opener.postMessage(message, window.location.origin);
      }, 300);
      return () => clearInterval(retry);
    }

    (async () => {
      try {
        if (code) await completeSessionFromCode(code);
      } catch {
        // The helper may have already completed the session; AuthGate will send
        // the user back to login if there's genuinely no session.
      } finally {
        setDone(true);
      }
    })();
  }, [code, error, errorDescription]);

  if (done) return <Redirect href="/" />;
  return <LoadingOverlay message={t('common.loading')} />;
}
