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
 * Drive the Microsoft (Entra ID) sign-in via Supabase's Azure provider.
 *
 * Web uses a full-page redirect — the most reliable browser flow. The popup
 * approach failed three different ways in the field (blocked when opened
 * after an await, postMessage dropped on same-tick close, opener link severed
 * by COOP on some Microsoft pages), and a redirect has none of those failure
 * modes: the tab navigates to Microsoft, comes back on /auth/callback?code=…,
 * the app reboots, and app/auth/callback.tsx exchanges the code inline. The
 * PKCE code_verifier survives the round trip in localStorage.
 *
 * Native keeps the in-app browser flow: open the system auth browser, then
 * exchange the returned code here. onAuthStateChange (hooks/useAuth.ts) picks
 * the session up and the AuthGate routes the user.
 */
export async function signInWithMicrosoft(): Promise<void> {
  if (Platform.OS === 'web') {
    // No skipBrowserRedirect: supabase-js navigates this tab to Microsoft itself.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: { redirectTo, scopes: 'openid profile email' },
    });
    if (error) throw error;
    return; // the browser is navigating away
  }

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
  await completeSessionFromCode(extractCode(result.url));
}
