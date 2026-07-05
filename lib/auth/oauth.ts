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

/** Pull the PKCE auth code out of the redirect URL Supabase sends us back to. */
function extractCode(url: string): string | null {
  const params = new URL(url).searchParams;
  return params.get('code');
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
 * Drive the native Microsoft (Entra ID) sign-in via Supabase's Azure provider.
 * Opens the system auth browser, then exchanges the returned PKCE code for a
 * Supabase session. onAuthStateChange (hooks/useAuth.ts) picks it up and the
 * AuthGate routes the user. Throws on failure so callers can surface the error.
 */
export async function signInWithMicrosoft(): Promise<void> {
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

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') {
    // User cancelled/dismissed — not an error worth surfacing.
    return;
  }

  const code = extractCode(result.url);
  if (!code) throw new Error('Microsoft sign-in did not return an authorization code');

  await completeSessionFromCode(code);
}
