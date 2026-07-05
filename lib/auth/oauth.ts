// Microsoft (Entra ID) sign-in via Supabase's Azure OAuth provider.
//
// Web:    full-page redirect. signInWithOAuth navigates this tab to Microsoft;
//         the redirect returns to /auth/callback?code=… and supabase-js
//         completes the exchange automatically during client init
//         (detectSessionInUrl in lib/supabase.ts). No manual exchange here.
// Native: in-app auth browser. signInWithOAuth hands back the authorize URL,
//         expo-web-browser drives the session, and we exchange the returned
//         PKCE code explicitly.
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { supabase } from '../supabase';

// Dismisses any leftover auth browser session when the app regains focus.
WebBrowser.maybeCompleteAuthSession();

/**
 * Where Microsoft/Supabase sends the user back to.
 *
 * Web: derived from the current URL because the app is served under the
 * /rita-app subpath on GitHub Pages — makeRedirectUri only knows the origin
 * and would build a path that 404s there. Local dev at the root still works.
 * Native: the rita:// deep link. Both forms must be registered in the
 * Supabase dashboard under Authentication → URL Configuration → Redirect URLs.
 */
function getRedirectTo(): string {
  if (Platform.OS === 'web') {
    const { origin, pathname } = window.location;
    const base = pathname.startsWith('/rita-app') ? '/rita-app' : '';
    return `${origin}${base}/auth/callback`;
  }
  return makeRedirectUri({ scheme: 'rita', path: 'auth/callback' });
}

/**
 * Exchange a PKCE auth code for a Supabase session — idempotent.
 *
 * Only used by the native flow (web is handled by detectSessionInUrl). On
 * Android the redirect both resolves openAuthSessionAsync AND leaks a deep
 * link into app/auth/callback.tsx, so this can run twice with the same
 * single-use code: short-circuit when a session already exists, and only
 * re-throw an exchange failure if there's still no session afterwards.
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

/** Pull the auth code (or the provider's error) out of the native redirect URL. */
function extractCode(url: string): string {
  const parsed = new URL(url);
  const code = parsed.searchParams.get('code');
  if (code) return code;

  const errorDesc = parsed.searchParams.get('error_description') ?? parsed.searchParams.get('error');
  throw new Error(
    errorDesc ? decodeURIComponent(errorDesc) : 'Microsoft sign-in did not return an authorization code',
  );
}

/**
 * Start the Microsoft sign-in. Once a session exists, onAuthStateChange
 * (hooks/useAuth.ts) picks it up and AuthGate routes the user by role.
 * Throws on failure so the login screen can surface the error.
 */
export async function signInWithMicrosoft(): Promise<void> {
  const redirectTo = getRedirectTo();

  if (Platform.OS === 'web') {
    // No skipBrowserRedirect: supabase-js navigates this tab to Microsoft.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: { redirectTo, scopes: 'openid profile email' },
    });
    if (error) throw error;
    return; // the browser is navigating away
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'azure',
    options: { redirectTo, skipBrowserRedirect: true, scopes: 'openid profile email' },
  });
  if (error) throw error;
  if (!data?.url) throw new Error('Could not start Microsoft sign-in');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return; // user cancelled/dismissed — not an error

  await completeSessionFromCode(extractCode(result.url));
}
