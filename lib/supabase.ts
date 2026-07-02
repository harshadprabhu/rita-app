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

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: isBrowserOrNative ? AsyncStorage : undefined,
    autoRefreshToken: isBrowserOrNative,
    persistSession: isBrowserOrNative,
    detectSessionInUrl: false,
    // PKCE is required for the native Microsoft OAuth flow: signInWithOAuth
    // issues an auth code that we exchange for a session via exchangeCodeForSession.
    flowType: 'pkce',
  },
});
