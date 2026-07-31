import { supabase } from '../supabase';
import { DbBroadcast } from '../../types';

export async function getBroadcasts(): Promise<DbBroadcast[]> {
  const { data, error } = await supabase
    .from('broadcasts')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as DbBroadcast[];
}

/**
 * Fetch broadcasts visible to a specific store (includes "all stores" ones).
 * `kind` filters system alerts (e.g. gold_rate) vs human announcements — the
 * Alerts feed wants everything, the Announcements screen only wants the
 * manager-authored ones.
 */
export async function getBroadcastsForStore(
  storeId: string | null,
  kind?: DbBroadcast['kind'],
): Promise<DbBroadcast[]> {
  let q = supabase
    .from('broadcasts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);
  // Promotions live only on the gold-rate poster, never in the Alerts feed.
  if (kind) q = q.eq('kind', kind);
  else q = q.neq('kind', 'promotion');
  const { data, error } = await q;
  if (error) throw error;
  const all = (data ?? []) as DbBroadcast[];
  if (!storeId) return all;

  return all.filter((b) => {
    // Target-all broadcasts
    if (!b.target_store_id && (!b.target_store_ids || b.target_store_ids.length === 0)) return true;
    // Legacy single-store
    if (b.target_store_id === storeId) return true;
    // New multi-store array
    if (b.target_store_ids?.includes(storeId)) return true;
    return false;
  });
}

export interface CreateBroadcastPayload {
  sender_id: string;
  title: string;
  body: string;
  /** Single legacy store -- prefer target_store_ids for new broadcasts. */
  target_store_id?: string;
  /** One or more stores; empty/undefined means all stores. */
  target_store_ids?: string[];
}

/** Max length of a promotion line shown on the gold-rate poster. */
export const PROMOTION_MAX_LEN = 100;

/**
 * Truncate by Unicode code point, not UTF-16 code unit. Plain `.slice(0, n)`
 * can bisect a surrogate pair (emoji, some symbols outside the BMP), leaving
 * a dangling half-character that renders as a replacement glyph/mojibake —
 * this was why promotion text sometimes showed garbled characters.
 */
export function truncateUnicode(text: string, maxLen: number): string {
  return Array.from(text).slice(0, maxLen).join('');
}

/**
 * The current promotion (Ops Manager scheme/offer) visible to a store, or
 * null. `storeId` scopes it the same way broadcasts are scoped — a promotion
 * with no target stores is visible everywhere; one targeted at specific
 * stores only shows there. The latest matching kind='promotion' row wins; an
 * empty body clears it.
 */
export async function getActivePromotion(storeId?: string | null): Promise<string | null> {
  const { data } = await supabase
    .from('broadcasts')
    .select('body, target_store_id, target_store_ids')
    .eq('kind', 'promotion')
    .order('created_at', { ascending: false })
    .limit(20);
  const rows = (data ?? []) as { body: string; target_store_id: string | null; target_store_ids: string[] | null }[];
  const visible = rows.find((b) => {
    if (!b.target_store_id && (!b.target_store_ids || b.target_store_ids.length === 0)) return true;
    if (!storeId) return false; // a store-scoped promo doesn't apply to a store-less viewer
    if (b.target_store_id === storeId) return true;
    return !!b.target_store_ids?.includes(storeId);
  });
  const body = visible?.body?.trim();
  return body ? body : null;
}

/** The most recently published promotion row, unscoped by viewer store — used
 *  by the composer screen to preview what's currently live and who it targets
 *  (as opposed to getActivePromotion, which is audience-scoped for display). */
export async function getLatestPromotionRow(): Promise<{ body: string; target_store_id: string | null; target_store_ids: string[] | null } | null> {
  const { data } = await supabase
    .from('broadcasts')
    .select('body, target_store_id, target_store_ids')
    .eq('kind', 'promotion')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = data as { body: string; target_store_id: string | null; target_store_ids: string[] | null } | null;
  return row?.body?.trim() ? row : null;
}

/** Publish a promotion (Ops Manager only, enforced by RLS + role gating). */
export async function createPromotion(
  senderId: string,
  text: string,
  targetStoreIds?: string[],
): Promise<void> {
  const body = truncateUnicode(text.trim(), PROMOTION_MAX_LEN);
  const insert: Record<string, unknown> = { sender_id: senderId, kind: 'promotion', title: 'Promotion', body };
  if (targetStoreIds && targetStoreIds.length === 1) insert.target_store_id = targetStoreIds[0];
  else if (targetStoreIds && targetStoreIds.length > 1) insert.target_store_ids = targetStoreIds;
  // else: no target => visible everywhere (target_store_id/ids left null)
  const { error } = await supabase.from('broadcasts').insert(insert);
  if (error) throw error;
}

/** Fetch the set of broadcast IDs this user has already read. */
export async function getBroadcastReadIds(userId: string): Promise<Set<string>> {
  const { data } = await supabase
    .from('broadcast_reads')
    .select('broadcast_id')
    .eq('user_id', userId);
  return new Set(((data ?? []) as { broadcast_id: string }[]).map((r) => r.broadcast_id));
}

/** Mark a list of broadcast IDs as read for the given user (idempotent). */
export async function markBroadcastsRead(userId: string, broadcastIds: string[]): Promise<void> {
  if (!broadcastIds.length) return;
  const rows = broadcastIds.map((broadcast_id) => ({ user_id: userId, broadcast_id }));
  await supabase
    .from('broadcast_reads')
    .upsert(rows, { onConflict: 'user_id,broadcast_id', ignoreDuplicates: true });
}

export async function createBroadcast(payload: CreateBroadcastPayload): Promise<DbBroadcast> {
  const insert: Record<string, unknown> = {
    sender_id: payload.sender_id,
    title: payload.title,
    body: payload.body,
  };

  const storeIds = payload.target_store_ids ?? [];

  if (storeIds.length === 1) {
    // Normalise single selection into the legacy column for compat
    insert.target_store_id = storeIds[0];
  } else if (storeIds.length > 1) {
    insert.target_store_ids = storeIds;
  } else if (payload.target_store_id) {
    insert.target_store_id = payload.target_store_id;
  }
  // else: target_store_id / target_store_ids both null => all stores

  const { data, error } = await supabase
    .from('broadcasts')
    .insert(insert)
    .select()
    .single();
  if (error) throw error;

  // Push notifications are sent server-side by the `broadcast_push` DB trigger
  // (calls the send-push edge function with service-role token access). We
  // deliberately do NOT push from the client here — doing so would double-send,
  // and the client can't read other users' tokens under RLS anyway.

  return data as DbBroadcast;
}
