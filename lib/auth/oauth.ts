import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { supabase } from '../supabase';

// Dismisses any leftover auth browser session when the app regains focus.
WebBrowser.maybeCompleteAuthSession();

// On web, makeRedirectUri only knows window.location.origin — it has no idea
// this app is served under the /rita-app GitHub Pages subpath, so it built
// https://host/auth/callback instead of https://host/rita-app/auth/callback
// (a path that 404s on Pages). Derive the base path from the current URL
// instead of hardcoding it, so local/dev at the root still works too.
function webRedirectTo(): string {
  const { origin, pathname } = window.location;
  const base = pathname.startsWith('/rita-app') ? '/rita-app' : '';
  return `${origin}${base}/auth/callback`;
}

// Deep link the Microsoft OAuth flow returns to. Must also be registered in the
// Supabase dashboard under Authentication → URL Configuration → Redirect URLs.
const redirectTo = Platform.OS === 'web'
  ? webRedirectTo()
  : makeRedirectUri({ scheme: 'rita', path: 'auth/callback' });

/**
 * Pull the PKCE auth code out of the redirect URL Supabase sends us back to.
 * Supabase reports failures (bad redirect URL, provider misconfig, etc.) as
 * `?error=...&error_description=...` on this same URL — sometimes as a query
 * param, sometimes in the hash fragment — so surface that instead of masking
 * every non-code outcome behind one generic message.
 */
function extractCode(url: string): string {
  const parsed = new URL(url);
  const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ''));
  const code = parsed.searchParams.get('code') ?? hashParams.get('code');
  if (code) return code;

  const errorDesc =
    parsed.searchParams.get('error_description') ?? hashParams.get('error_description');
  const error = parsed.searchParams.get('error') ?? hashParams.get('error');
  if (error) throw new Error(errorDesc ? decodeURIComponent(errorDesc) : error);

  throw new Error(`Microsoft sign-in did not return an authorization code: ${url}`);
}

/**
 * Exchange a PKCE auth code for a Supabase session — race-safe.
 *
 * On Android the redirect both resolves openAuthSessionAsync AND leaks a deep
 * link into the app (app/auth/callback.tsx), so this can be called twice with
 * the same single-use code. We short-circuit if a session already exists, and
 * if the exchange fails we only re-throw when there's still no session (i.e. the
 * other caller didn't already consume the code).
 */
export async function completeSessionFromCode(code: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) return;

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const { data: { session: after } } = await supabase.auth.getSession();
    if (!after) throw error;
  }
}

/**
 * Open a blank popup synchronously — must be called with no `await` before it
 * in the click handler. expo-web-browser's own openAuthSessionAsync only opens
 * its popup once you call it, and we can't call it until Supabase hands back
 * the authorize URL, which needs an `await`. Browsers stop treating window.open
 * as a direct result of the click after that gap and silently block it (this
 * was the actual cause of "clicking sign in does nothing" — no error, no
 * popup). Opening blank first, then navigating it once the URL is ready, keeps
 * the open() call inside the synchronous click-gesture window.
 */
function openWebAuthPopup(): Window {
  const popup = window.open('', 'rita-sso', 'width=500,height=650');
  if (!popup) {
    throw new Error('Popup window was blocked. Please allow popups for this site and try again.');
  }
  return popup;
}

/**
 * Wait for the popup to hand back its result via postMessage.
 *
 * The popup lands on /auth/callback, which boots this same app fresh inside
 * it — so app/auth/callback.tsx detects it's running as a popup (window.opener
 * set) and, instead of exchanging the code itself, posts it back here and
 * closes itself. That handoff is what makes this safe: if both the popup
 * and this poller tried to exchange the same single-use PKCE code, whichever
 * lost the race would fail with no clear feedback (this was the actual cause
 * of "it pops up and closes, nothing happens").
 */
function waitForPopupMessage(popup: Window): Promise<{ code?: string; error?: string }> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      clearInterval(closedCheck);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== popup) return;
      const payload = event.data?.ritaOAuth;
      if (!payload) return;
      cleanup();
      resolve(payload);
    };
    window.addEventListener('message', onMessage);
    const closedCheck = setInterval(() => {
      if (popup.closed) {
        cleanup();
        reject(new Error('Microsoft sign-in was cancelled.'));
      }
    }, 400);
  });
}

/**
 * Drive the Microsoft (Entra ID) sign-in via Supabase's Azure provider.
 * Exchanges the returned PKCE code for a Supabase session. onAuthStateChange
 * (hooks/useAuth.ts) picks it up and the AuthGate routes the user. Throws on
 * failure so callers can surface the error.
 */
export async function signInWithMicrosoft(): Promise<void> {
  const popup = Platform.OS === 'web' ? openWebAuthPopup() : null;
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
        scopes: 'openid profile email',
      },
    });
    if (error) throw error;
    if (!data?.url) throw new Error('Could not start Microsoft sign-in');

    if (popup) {
      popup.location.href = data.url;
      const result = await waitForPopupMessage(popup);
      if (!result.code) throw new Error(result.error ?? 'Microsoft sign-in did not return an authorization code');
      await completeSessionFromCode(result.code);
      return;
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success') {
      // User cancelled/dismissed — not an error worth surfacing.
      return;
    }
    await completeSessionFromCode(extractCode(result.url));
  } finally {
    if (popup && !popup.closed) popup.close();
  }
}
