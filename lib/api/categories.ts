import { supabase } from '../supabase';

export interface TicketCategory {
  id: string;
  name: string;
  parent_id: string | null;
  is_subcategory: boolean;
}

/**
 * All active Sampark categories + subcategories (synced by the sampark-sync
 * edge function). Callers split by `is_subcategory` and match subcategories to
 * a parent via `parent_id`.
 */
export async function getTicketCategories(): Promise<TicketCategory[]> {
  const { data, error } = await supabase
    .from('ticket_categories')
    .select('id, name, parent_id, is_subcategory')
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return (data ?? []) as TicketCategory[];
}
