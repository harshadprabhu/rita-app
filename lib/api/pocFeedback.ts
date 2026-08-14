import { supabase } from '../supabase';
import { DbPocFeedback } from '../../types/database';

export type PocFeedbackInsert = Omit<DbPocFeedback, 'id' | 'created_at'>;

export async function submitPocFeedback(payload: PocFeedbackInsert): Promise<DbPocFeedback> {
  const { data, error } = await supabase
    .from('poc_feedback')
    .upsert(payload, { onConflict: 'user_id' })
    .select()
    .single();
  if (error) throw error;
  return data as DbPocFeedback;
}

export async function getMyFeedback(userId: string): Promise<DbPocFeedback | null> {
  const { data, error } = await supabase
    .from('poc_feedback')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data as DbPocFeedback | null;
}

export async function getAllFeedback(): Promise<(DbPocFeedback & { profile?: { display_name: string }; store?: { name: string } })[]> {
  const { data, error } = await supabase
    .from('poc_feedback')
    .select('*, profile:profiles!poc_feedback_user_id_fkey(display_name), store:stores!poc_feedback_store_id_fkey(name)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as any;
}
