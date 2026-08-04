import { supabase } from '../supabase';

export interface TicketCategory {
  id: string;
  name: string;
  parent_id: string | null;
  is_subcategory: boolean;
  /** True for the finest-grain node (Sampark's "Item"); its parent_id points
   *  at a subcategory (or a category, if that category has no subcategories). */
  is_item: boolean;
  /** Top discriminative keywords learned from real historical Sampark tickets
   *  (TF-IDF, refreshed on every sampark-sync run) — ranked most → least
   *  distinctive. Powers samparkClassifier's auto-parse engine. */
  keywords: string[] | null;
  /** Real ticket volume at this node from the last sync's sample — used as a
   *  small tie-breaking prior (common categories nudge ahead of rare ones on
   *  close keyword-score calls). Not cumulative; refreshed each sync. */
  ticket_count: number;
}

/**
 * All active Sampark categories + subcategories + items (synced by the
 * sampark-sync edge function). Callers split by `is_subcategory`/`is_item` and
 * match children to a parent via `parent_id`.
 */
export async function getTicketCategories(): Promise<TicketCategory[]> {
  const { data, error } = await supabase
    .from('ticket_categories')
    .select('id, name, parent_id, is_subcategory, is_item, keywords, ticket_count')
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return (data ?? []) as TicketCategory[];
}
