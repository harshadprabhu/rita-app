import { supabase } from '../supabase';
import { TicketWithRelations } from '../../types/ticket';

const TICKET_SELECT = `
  *,
  requester:profiles!tickets_requester_id_fkey(id, display_name, designation),
  assignee:profiles!tickets_assignee_id_fkey(id, display_name, designation),
  store:stores(id, name, code, city),
  attachments:ticket_attachments(*)
`;

export async function getBreachedTickets(): Promise<TicketWithRelations[]> {
  const { data, error } = await supabase
    .from('tickets')
    .select(TICKET_SELECT)
    .eq('sla_breached', true)
    .not('status', 'eq', 'resolved')
    .order('sla_due_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as TicketWithRelations[];
}

export async function reassignTicket(
  ticketId: string,
  assigneeId: string | null,
  departmentId: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('tickets')
    .update({ assignee_id: assigneeId, department_id: departmentId })
    .eq('id', ticketId);
  if (error) throw error;
}
