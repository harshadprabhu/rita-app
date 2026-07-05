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
 * PKCE code — whichever lost failed silently ("pops up and closes, nothing
 * happens"). So when running as a popup, just hand the result back via
 * postMessage and close; only the opener ever exchanges the code.
 */
export default function AuthCallback() {
  const { t } = useTranslation();
  const { code, error, error_description: errorDescription } =
    useLocalSearchParams<{ code?: string; error?: string; error_description?: string }>();
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web' && window.opener && window.opener !== window) {
      window.opener.postMessage(
        { ritaOAuth: code ? { code } : { error: error ?? errorDescription ?? 'unknown_error' } },
        window.location.origin,
      );
      window.close();
      return;
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
