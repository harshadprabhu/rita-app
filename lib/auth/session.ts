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
 * Derive a store from the AD login ID itself — for store-tablet accounts whose
 * username encodes the store (e.g. ns0055@…, store.ns0055@…, …0055@…). Scans the
 * local-part for store tokens and matches them against the synced stores by
 * retail_channel_id (NS####) or code (the 00000### operating-unit number).
 * Fallback for when the D365 worker address book didn't resolve a store.
 */
async function storeFromAdId(email: string | undefined) {
  if (!email) return null;
  const local = email.split('@')[0].toLowerCase();

  // Candidate tokens: NS/NF channel codes (own stores / franchise) and bare
  // digit runs (3–8 digits).
  const channelTokens = (local.match(/n[sf]\d{3,4}/gi) ?? []).map((t) => t.toUpperCase());
  const digitTokens = local.match(/\d{3,8}/g) ?? [];
  // A bare store number may be zero-padded to the 8-char code (e.g. 55 → 00000055).
  const codeTokens = digitTokens.flatMap((d) => [d, d.padStart(8, '0')]);

  if (!channelTokens.length && !codeTokens.length) return null;

  const orParts: string[] = [];
  if (channelTokens.length) orParts.push(`retail_channel_id.in.(${channelTokens.join(',')})`);
  if (codeTokens.length) orParts.push(`code.in.(${codeTokens.join(',')})`);

  const { data } = await supabase
    .from('stores')
    .select('id, name, city')
    .eq('is_active', true)
    .or(orParts.join(','))
    .limit(1)
    .maybeSingle();
  const row = data as { id: string; name: string; city: string | null } | null;
  return row ? { store_id: row.id, store_name: row.name, store_location: row.city } : null;
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
  // Store resolution order: bootstrap admins → head office; otherwise the D365
  // worker store (address book); otherwise the store encoded in the AD login id
  // (store-tablet accounts). Anything still unresolved falls to onboarding.
  const adStore = (worker?.store || isBootstrapAdmin) ? null : await storeFromAdId(user.email);
  const store = worker?.store ?? adStore;
  // A store resolved from the AD id with no matching person record is a shared
  // store-tablet/kiosk account — mark it so the app scopes it to store-wide
  // ticket views instead of a single requester's tickets.
  if (!worker && adStore) insert.designation = 'Store Tablet';

  if (isBootstrapAdmin) {
    Object.assign(insert, HEAD_OFFICE);
  } else if (store) {
    insert.store_id = store.store_id;
    insert.store_name = store.store_name;
    insert.store_location = store.store_location;
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
