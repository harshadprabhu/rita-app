import { supabase } from '../supabase';
import { DbTicketComment } from '../../types';
import { CommentWithAuthor } from '../../types/ticket';

export async function getComments(ticketId: string): Promise<CommentWithAuthor[]> {
  const { data, error } = await supabase
    .from('ticket_comments')
    .select('*, author:profiles!author_id(id, display_name, role)')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as CommentWithAuthor[];
}

export async function addComment(payload: {
  ticket_id: string;
  author_id: string;
  body: string;
  is_internal?: boolean;
}): Promise<DbTicketComment> {
  const { data, error } = await supabase
    .from('ticket_comments')
    .insert({ ...payload, is_internal: payload.is_internal ?? false })
    .select()
    .single();
  if (error) throw error;
  return data as DbTicketComment;
}
