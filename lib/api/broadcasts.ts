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

/** Fetch broadcasts visible to a specific store (includes "all stores" ones). */
export async function getBroadcastsForStore(storeId: string | null): Promise<DbBroadcast[]> {
  const { data, error } = await supabase
    .from('broadcasts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);
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
