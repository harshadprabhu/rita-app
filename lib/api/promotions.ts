import { supabase } from '../supabase';

/** Max length of a promotion line shown on the gold-rate poster. */
export const PROMOTION_MAX_LEN = 100;

/**
 * Truncate by Unicode code point, not UTF-16 code unit. Plain `.slice(0, n)`
 * can bisect a surrogate pair (emoji, some symbols outside the BMP), leaving
 * a dangling half-character that renders as a replacement glyph/mojibake.
 */
export function truncateUnicode(text: string, maxLen: number): string {
  return Array.from(text).slice(0, maxLen).join('');
}

export interface Promotion {
  id: string;
  seq: number;
  sender_id: string | null;
  body: string;
  target_store_id: string | null;
  target_store_ids: string[] | null;
  is_active: boolean;
  activated_at: string;
  deactivated_at: string | null;
  created_at: string;
}

/** Every target store id this promotion covers ([] means "all stores"). */
function targetIds(p: Pick<Promotion, 'target_store_id' | 'target_store_ids'>): string[] {
  if (p.target_store_ids?.length) return p.target_store_ids;
  if (p.target_store_id) return [p.target_store_id];
  return [];
}

/** True if two target sets would show on at least one store in common — an
 *  empty set ("all stores") overlaps with everything. */
export function targetsOverlap(a: Pick<Promotion, 'target_store_id' | 'target_store_ids'>, b: Pick<Promotion, 'target_store_id' | 'target_store_ids'>): boolean {
  const idsA = targetIds(a);
  const idsB = targetIds(b);
  if (!idsA.length || !idsB.length) return true; // either side is "all stores"
  return idsA.some((id) => idsB.includes(id));
}

/** All promotions (any sender), newest first — for the management list. */
export async function getPromotions(): Promise<Promotion[]> {
  const { data, error } = await supabase
    .from('promotions')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Promotion[];
}

/** Currently-active promotions only — used both for overlap checks and to
 *  find what a given store should see. */
export async function getActivePromotions(): Promise<Promotion[]> {
  const { data, error } = await supabase
    .from('promotions')
    .select('*')
    .eq('is_active', true)
    .order('activated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Promotion[];
}

/** The promotion a specific store's gold-rate poster should show, or null. */
export async function getActivePromotionForStore(storeId?: string | null): Promise<string | null> {
  const active = await getActivePromotions();
  const match = active.find((p) => {
    const ids = targetIds(p);
    if (!ids.length) return true; // all stores
    return !!storeId && ids.includes(storeId);
  });
  return match?.body?.trim() || null;
}

/** Active promotions whose target overlaps the given (proposed) target set —
 *  call before publishing to warn the Ops Manager instead of silently
 *  double-booking a store with two promotions. */
export async function findOverlappingPromotions(targetStoreIds: string[]): Promise<Promotion[]> {
  const active = await getActivePromotions();
  const proposed = { target_store_id: null, target_store_ids: targetStoreIds };
  return active.filter((p) => targetsOverlap(p, proposed));
}

export async function createPromotion(
  senderId: string,
  text: string,
  targetStoreIds: string[],
): Promise<Promotion> {
  const body = truncateUnicode(text.trim(), PROMOTION_MAX_LEN);
  const insert: Record<string, unknown> = { sender_id: senderId, body };
  if (targetStoreIds.length === 1) insert.target_store_id = targetStoreIds[0];
  else if (targetStoreIds.length > 1) insert.target_store_ids = targetStoreIds;
  const { data, error } = await supabase.from('promotions').insert(insert).select().single();
  if (error) throw error;
  return data as Promotion;
}

export async function deactivatePromotion(id: string): Promise<void> {
  const { error } = await supabase
    .from('promotions')
    .update({ is_active: false, deactivated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

/** Reactivate a previously-deactivated promotion — caller should re-run
 *  findOverlappingPromotions first, same as a fresh publish. */
export async function reactivatePromotion(id: string): Promise<void> {
  const { error } = await supabase
    .from('promotions')
    .update({ is_active: true, activated_at: new Date().toISOString(), deactivated_at: null })
    .eq('id', id);
  if (error) throw error;
}
