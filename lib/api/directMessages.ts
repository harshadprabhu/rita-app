import { supabase } from '../supabase';

export interface DirectMessage {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
}

// Full conversation between the current user and `otherId`, oldest first.
export async function getConversation(meId: string, otherId: string): Promise<DirectMessage[]> {
  const { data, error } = await supabase
    .from('direct_messages')
    .select('*')
    .or(
      `and(sender_id.eq.${meId},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${meId})`,
    )
    .order('created_at', { ascending: true })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as DirectMessage[];
}

export async function sendDirectMessage(recipientId: string, body: string): Promise<DirectMessage> {
  const meId = (await supabase.auth.getUser()).data.user?.id;
  if (!meId) throw new Error('Not signed in');
  const { data, error } = await supabase
    .from('direct_messages')
    .insert({ sender_id: meId, recipient_id: recipientId, body: body.trim() })
    .select()
    .single();
  if (error) throw error;
  return data as DirectMessage;
}

// Mark every message from `otherId` to me as read.
export async function markConversationRead(meId: string, otherId: string): Promise<void> {
  await supabase
    .from('direct_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_id', meId)
    .eq('sender_id', otherId)
    .is('read_at', null);
}

export interface DmConversation {
  otherId: string;
  lastBody: string;
  lastAt: string;
  lastFromMe: boolean;
  unread: number;
}

// Recent conversations for an inbox: the other participant, last message, and
// unread count. Reduces the newest ~500 messages client-side (Supabase has no
// simple "distinct on" through PostgREST).
export async function getConversationList(meId: string): Promise<DmConversation[]> {
  const { data, error } = await supabase
    .from('direct_messages')
    .select('*')
    .or(`sender_id.eq.${meId},recipient_id.eq.${meId}`)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  const byOther = new Map<string, DmConversation>();
  for (const m of (data ?? []) as DirectMessage[]) {
    const otherId = m.sender_id === meId ? m.recipient_id : m.sender_id;
    let c = byOther.get(otherId);
    if (!c) {
      c = { otherId, lastBody: m.body, lastAt: m.created_at, lastFromMe: m.sender_id === meId, unread: 0 };
      byOther.set(otherId, c); // first seen = newest (list is desc)
    }
    if (m.recipient_id === meId && !m.read_at) c.unread += 1;
  }
  return Array.from(byOther.values());
}

// Count of unread DMs for the badge, grouped by sender.
export async function getUnreadDmCounts(meId: string): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('direct_messages')
    .select('sender_id')
    .eq('recipient_id', meId)
    .is('read_at', null);
  if (error) throw error;
  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as { sender_id: string }[]) {
    counts[row.sender_id] = (counts[row.sender_id] ?? 0) + 1;
  }
  return counts;
}
