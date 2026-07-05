import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// expo-router's static web export runs this module under Node SSR, where
// `window` doesn't exist — AsyncStorage assumes a browser and throws. Only
// wire up persistent storage when running in an actual browser/native runtime.
// React Native and browsers both define a global `window`; only Node SSR (used
// by expo-router's static web export) lacks it. Node 21+ added a global
// `navigator`, so that alone isn't a reliable check — `window` is.
const isBrowserOrNative = typeof window !== 'undefined';

// True only in a real web browser (not native, not Node SSR). On web we let
// supabase-js auto-complete the OAuth redirect itself (detectSessionInUrl):
// when the app boots on /auth/callback?code=…, the client exchanges the code
// during initialization and cleans the URL — no manual exchange code to race
// or break. Native can't use this (deep links never hit window.location), so
// it exchanges the code explicitly in lib/auth/oauth.ts.
const isWebBrowser = typeof document !== 'undefined';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: isBrowserOrNative ? AsyncStorage : undefined,
    autoRefreshToken: isBrowserOrNative,
    persistSession: isBrowserOrNative,
    detectSessionInUrl: isWebBrowser,
    // PKCE for the Microsoft OAuth flow: signInWithOAuth issues an auth code
    // that gets exchanged for a session (automatically on web, explicitly on
    // native via exchangeCodeForSession).
    flowType: 'pkce',
  },
});
