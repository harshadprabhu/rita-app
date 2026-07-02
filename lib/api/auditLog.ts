import { supabase } from '../supabase';
import { AuditLogWithActor } from '../../types/ticket';

export async function logTicketAction(
  ticketId: string,
  actorId: string | null,
  action: string,
  fromValue: string | null,
  toValue: string | null,
): Promise<void> {
  await supabase.from('ticket_audit_log').insert({
    ticket_id: ticketId,
    actor_id: actorId,
    action,
    from_value: fromValue,
    to_value: toValue,
  });
}

export async function getTicketAuditLog(ticketId: string): Promise<AuditLogWithActor[]> {
  const { data, error } = await supabase
    .from('ticket_audit_log')
    .select('*, actor:profiles(id, display_name, role)')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as AuditLogWithActor[];
}
