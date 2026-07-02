import { useEffect, useState } from 'react';
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
 */
export default function AuthCallback() {
  const { t } = useTranslation();
  const { code } = useLocalSearchParams<{ code?: string }>();
  const [done, setDone] = useState(false);

  useEffect(() => {
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
  }, [code]);

  if (done) return <Redirect href="/" />;
  return <LoadingOverlay message={t('common.loading')} />;
}
