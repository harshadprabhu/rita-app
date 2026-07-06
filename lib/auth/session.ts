import type { User } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { DbProfile } from '../../types';

// Head-office store for staff who aren't tied to a retail location (admins,
// managers, technicians). Mirrors the seeded stores row (HO-PRABHADEVI).
const HEAD_OFFICE = {
  store_id: 'HO-PRABHADEVI',
  store_name: 'HO OIC Prabhadevi',
  store_location: 'Mumbai',
} as const;

// Bootstrap admins provisioned as admin (at the head office) on first sign-in,
// before any admin exists to promote them in-app. After bootstrap, all further
// role changes go through the admin Accounts screen.
const BOOTSTRAP_ADMIN_EMAILS = new Set([
  'harshad.prabhu@adityabirla.com',
  'hemant.johari@adityabirla.com',
]);

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

function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/);
  const first = parts[0] || 'User';
  const last = parts.slice(1).join(' ') || 'User';
  return { first, last };
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
 * Pre-fill fields from the D365 worker master (synced daily into `workers`),
 * matched on the sign-in email. When a worker record exists we use its real
 * name and phone, and — if D365's address book resolved a store — its store,
 * so a known employee's profile is complete on first sign-in with no manual
 * entry. Returns null (fall back to OAuth-derived name) for unknown emails.
 */
async function workerDefaults(email: string | undefined) {
  if (!email) return null;
  const { data: worker } = await supabase
    .from('workers')
    .select('name, phone, store_id')
    .eq('email', email.toLowerCase())
    .maybeSingle();
  const w = worker as { name: string | null; phone: string | null; store_id: string | null } | null;
  if (!w) return null;

  let store: { store_id: string; store_name: string | null; store_location: string | null } | null = null;
  if (w.store_id) {
    const { data: s } = await supabase
      .from('stores')
      .select('id, name, city')
      .eq('id', w.store_id)
      .maybeSingle();
    const row = s as { id: string; name: string; city: string | null } | null;
    if (row) store = { store_id: row.id, store_name: row.name, store_location: row.city };
  }
  return {
    name: w.name ? splitName(w.name) : null,
    phone: w.phone,
    store,
  };
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

  const worker = await workerDefaults(user.email);
  const { first, last } = worker?.name ?? deriveName(user);
  const isBootstrapAdmin = !!user.email && BOOTSTRAP_ADMIN_EMAILS.has(user.email.toLowerCase());

  const insert: Record<string, unknown> = {
    id: user.id,
    first_name: first,
    last_name: last,
    role: isBootstrapAdmin ? 'admin' : 'user',
    approval_status: 'approved',
    is_active: true,
    phone: worker?.phone ?? null,
  };
  // Bootstrap admins sit at the head office; everyone else takes their D365
  // worker store when the address book resolved one.
  if (isBootstrapAdmin) {
    Object.assign(insert, HEAD_OFFICE);
  } else if (worker?.store) {
    insert.store_id = worker.store.store_id;
    insert.store_name = worker.store.store_name;
    insert.store_location = worker.store.store_location;
  }

  const { error } = await supabase.from('profiles').insert(insert);
  // A concurrent insert (e.g. the SSO trigger firing too) is fine — re-read.
  if (error && error.code !== '23505') {
    console.warn('[ensureProfile] insert failed:', error.message);
  }
  return fetchProfile(user.id);
}

export async function signOut() {
  await supabase.auth.signOut();
}
