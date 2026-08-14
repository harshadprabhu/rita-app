import { supabase } from '../supabase';
import { DbTicketRating } from '../../types/database';

export type TicketRatingInsert = Omit<DbTicketRating, 'id' | 'created_at'>;

export async function submitTicketRating(payload: TicketRatingInsert): Promise<DbTicketRating> {
  const { data, error } = await supabase
    .from('ticket_ratings')
    .upsert(payload, { onConflict: 'ticket_id' })
    .select()
    .single();
  if (error) throw error;
  return data as DbTicketRating;
}

export async function getTicketRating(ticketId: string): Promise<DbTicketRating | null> {
  const { data, error } = await supabase
    .from('ticket_ratings')
    .select('*')
    .eq('ticket_id', ticketId)
    .maybeSingle();
  if (error) throw error;
  return data as DbTicketRating | null;
}

export async function getAllTicketRatings(): Promise<DbTicketRating[]> {
  const { data, error } = await supabase
    .from('ticket_ratings')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as DbTicketRating[];
}
