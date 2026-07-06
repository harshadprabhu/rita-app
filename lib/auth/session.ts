import type { User } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { DbProfile } from '../../types';

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

export async function fetchProfile(userId: string): Promise<DbProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) return null;
  return data as DbProfile;
}

/** Split an OAuth user's metadata into first/last name, with sane fallbacks. */
function deriveName(user: User): { first: string; last: string } {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : '');
  const full = str(meta.name) || str(meta.full_name) || (user.email ?? '').split('@')[0];
  const first = str(meta.given_name) || full.split(' ')[0] || 'User';
  const last =
    str(meta.family_name) || full.slice(first.length).trim() || 'User';
  return { first, last };
}

/**
 * Guarantee the signed-in user has a profile row, returning it.
 *
 * Microsoft SSO (and identity-linked accounts) create an auth user with no
 * matching profiles row, and a DB trigger can't cover every case — accounts
 * that predate it, or whose primary provider is 'email' after an identity
 * link, slip through. So the app self-heals: if no profile exists, insert a
 * bare one (role 'user', no store yet) under the caller's own RLS INSERT
 * policy, then let onboarding collect store + mobile. Never signs a
 * legitimately-authenticated user out for lack of a row.
 */
export async function ensureProfile(user: User): Promise<DbProfile | null> {
  const existing = await fetchProfile(user.id);
  if (existing) return existing;

  const { first, last } = deriveName(user);
  const { error } = await supabase.from('profiles').insert({
    id: user.id,
    first_name: first,
    last_name: last,
    role: 'user',
    approval_status: 'approved',
    is_active: true,
  });
  // A concurrent insert (e.g. the SSO trigger firing too) is fine — re-read.
  if (error && error.code !== '23505') {
    console.warn('[ensureProfile] insert failed:', error.message);
  }
  return fetchProfile(user.id);
}

export async function signInWithPassword(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function requestOtp(email: string) {
  return supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
}

export async function verifyOtp(email: string, token: string) {
  return supabase.auth.verifyOtp({ email, token, type: 'email' });
}

export async function signOut() {
  await supabase.auth.signOut();
}
