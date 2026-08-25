import { supabase } from '../supabase';
import { DbTicket, TicketStatus, TicketLifecycle, TicketPriority, DbTicketAttachment } from '../../types';
import { TicketWithRelations } from '../../types/ticket';
import { computeSlaDueAt } from '../../constants/sla';
import { logTicketAction } from './auditLog';
import { notifyTechnicians, notifyStoreUsers } from './notifications';
import { getMimeType, readFileAsBytes, compressIfImage } from '../utils/fileUpload';

interface TicketFilters {
  status?: TicketStatus;
  lifecycle?: TicketLifecycle;
  store_id?: string;
  requester_id?: string;
  assignee_id?: string;
  sla_breached?: boolean;
}

const TICKET_SELECT = `
  *,
  requester:profiles!tickets_requester_id_fkey(id, display_name, designation),
  assignee:profiles!tickets_assignee_id_fkey(id, display_name, designation),
  store:stores(id, name, code, city),
  attachments:ticket_attachments(*)
`;

export async function getTickets(filters: TicketFilters = {}): Promise<TicketWithRelations[]> {
  let query = supabase.from('tickets').select(TICKET_SELECT).order('created_at', { ascending: false });

  if (filters.status) query = query.eq('status', filters.status);
  if (filters.lifecycle) query = query.eq('lifecycle', filters.lifecycle);
  if (filters.store_id) query = query.eq('store_id', filters.store_id);
  if (filters.requester_id) query = query.eq('requester_id', filters.requester_id);
  if (filters.assignee_id) query = query.eq('assignee_id', filters.assignee_id);
  if (filters.sla_breached !== undefined) query = query.eq('sla_breached', filters.sla_breached);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as TicketWithRelations[];
}

/**
 * Count-only version of getTickets, for stat tiles that only ever read
 * `.length` off the result. A HEAD request with no row payload and no
 * joined relations (requester/assignee/store/attachments) — the full
 * getTickets() select was being used just to count tiles on the home
 * dashboard, pulling every joined relation for every ticket on every visit.
 */
export async function getTicketCount(filters: TicketFilters = {}): Promise<number> {
  let query = supabase.from('tickets').select('id', { count: 'exact', head: true });

  if (filters.status) query = query.eq('status', filters.status);
  if (filters.lifecycle) query = query.eq('lifecycle', filters.lifecycle);
  if (filters.store_id) query = query.eq('store_id', filters.store_id);
  if (filters.requester_id) query = query.eq('requester_id', filters.requester_id);
  if (filters.assignee_id) query = query.eq('assignee_id', filters.assignee_id);
  if (filters.sla_breached !== undefined) query = query.eq('sla_breached', filters.sla_breached);

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export async function getOpenTickets(): Promise<TicketWithRelations[]> {
  const { data, error } = await supabase
    .from('tickets')
    .select(TICKET_SELECT)
    .in('status', ['open', 'in_progress'] satisfies TicketStatus[])
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as TicketWithRelations[];
}

export async function getTicketById(id: string): Promise<TicketWithRelations> {
  const { data, error } = await supabase
    .from('tickets')
    .select(TICKET_SELECT)
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as unknown as TicketWithRelations;
}

export async function createTicket(payload: {
  requester_id: string;
  store_id: string;
  description: string;
  long_description?: string | null;
  priority: TicketPriority;
  category?: string | null;
  subcategory?: string | null;
  item?: string | null;
  contact_number?: string | null;
  source?: DbTicket['source'];
}): Promise<DbTicket> {
  const sla_due_at = computeSlaDueAt(payload.priority).toISOString();
  const { data, error } = await supabase
    .from('tickets')
    .insert({ ...payload, source: payload.source ?? 'form', sla_due_at })
    .select()
    .single();
  if (error) throw error;
  await logTicketAction(data.id, payload.requester_id, 'created', null, data.status);

  // Alert every approved technician the moment a ticket is raised. The
  // 'ticket_created' notification type, its UI icon, and notifyTechnicians()
  // already existed end-to-end — it was just never called from here, so no
  // one was ever alerted that a new ticket existed until they happened to
  // open the ticket list.
  const { data: store } = await supabase.from('stores').select('name').eq('id', payload.store_id).maybeSingle();
  const storeLabel = (store as { name?: string } | null)?.name ?? payload.store_id;
  await notifyTechnicians(
    data.id,
    'New ticket raised',
    `${storeLabel}: ${payload.description}`,
    'ticket_created',
  ).catch(() => null);

  // Also alert everyone else at the same store so the whole store team
  // knows a ticket was raised (not just the requester and the tech pool).
  await notifyStoreUsers(
    payload.store_id,
    payload.requester_id,
    data.id,
    'New ticket at your store',
    `${storeLabel}: ${payload.description}`,
    'ticket_created',
  ).catch(() => null);

  return data as DbTicket;
}

export async function pushTicketToSampark(ticketId: string): Promise<{ request_id: string; display_id: string }> {
  const { data, error } = await supabase.functions.invoke('sampark-push', { body: { ticket_id: ticketId } });
  if (error) throw new Error(`Sampark sync failed: ${error.message}`);
  if (!data?.ok) throw new Error(data?.sampark_error ?? data?.error ?? 'Sampark sync failed — unknown error');
  return { request_id: data.request_id, display_id: data.display_id };
}

export async function updateTicket(
  id: string,
  updates: Partial<Pick<DbTicket, 'status' | 'lifecycle' | 'priority' | 'assignee_id' | 'resolution' | 'resolved_at' | 'category' | 'subcategory' | 'item' | 'description' | 'long_description' | 'department_id'>>,
  actorId?: string,
): Promise<DbTicket> {
  const before = actorId ? await getTicketById(id).catch(() => null) : null;
  const { data, error } = await supabase
    .from('tickets')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  if (actorId && before) {
    for (const key of Object.keys(updates) as (keyof typeof updates)[]) {
      const fromVal = (before as unknown as Record<string, unknown>)[key];
      const toVal = (updates as unknown as Record<string, unknown>)[key];
      if (fromVal !== toVal) {
        await logTicketAction(id, actorId, `updated:${key}`, String(fromVal ?? ''), String(toVal ?? ''));
      }
    }
  }

  // Notify every user at the ticket's store whenever the status changes, so
  // the whole store team stays aware (not just the original requester).
  // Excludes the actor to avoid self-pinging.
  if (updates.status && before && before.status !== data.status && data.store_id) {
    const resolved = data.status === 'resolved';
    const readable = String(data.status).replace(/_/g, ' ');
    const idLabel = data.sampark_display_id ? `#${data.sampark_display_id}` : 'Ticket';
    await notifyStoreUsers(
      data.store_id,
      actorId ?? null,
      id,
      resolved ? 'Ticket resolved' : 'Ticket status updated',
      `${idLabel}: ${resolved ? 'marked resolved' : `moved to ${readable}`}`,
      resolved ? 'ticket_resolved' : 'ticket_updated',
    ).catch(() => null);
  }

  return data as DbTicket;
}

export async function claimTicket(ticketId: string, technicianId: string): Promise<DbTicket> {
  const { data, error } = await supabase
    .from('tickets')
    .update({ assignee_id: technicianId, lifecycle: 'being_worked_on' satisfies TicketLifecycle, status: 'in_progress' satisfies TicketStatus })
    .eq('id', ticketId)
    .is('assignee_id', null)
    .select()
    .single();
  if (error) throw error;
  await logTicketAction(ticketId, technicianId, 'self_assigned', 'unassigned', technicianId);
  return data as DbTicket;
}

/**
 * Admin/manager (re)assignment to a specific technician. Unlike claimTicket this
 * overwrites any existing assignee, moves the ticket into active work, and logs
 * the change with the acting admin as the actor for a clean audit trail.
 */
export async function reassignTicket(
  ticketId: string,
  technicianId: string,
  actorId: string,
): Promise<DbTicket> {
  const before = await getTicketById(ticketId).catch(() => null);
  const { data, error } = await supabase
    .from('tickets')
    .update({ assignee_id: technicianId, lifecycle: 'being_worked_on' satisfies TicketLifecycle, status: 'in_progress' satisfies TicketStatus })
    .eq('id', ticketId)
    .select()
    .single();
  if (error) throw error;
  await logTicketAction(
    ticketId,
    actorId,
    'reassigned',
    before?.assignee_id ?? 'unassigned',
    technicianId,
  );
  return data as DbTicket;
}

export async function deleteTicket(ticketId: string): Promise<void> {
  // Ask PostgREST to return the deleted rows so we can detect the
  // deny-by-default-RLS case (no error, but zero rows removed). Without
  // this, a missing DELETE policy makes the button appear to do nothing.
  const { data, error } = await supabase
    .from('tickets')
    .delete()
    .eq('id', ticketId)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error(
      'Delete blocked — no rows affected. Your role likely lacks a DELETE policy on tickets, or the ticket no longer exists.',
    );
  }
}

export async function uploadAttachment(
  ticketId: string,
  uri: string,
  fileName: string,
  fileType: 'image' | 'video' | 'document' = 'image',
  mimeType?: string,
): Promise<DbTicketAttachment> {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `tickets/${ticketId}/${Date.now()}_${safeName}`;
  const contentType = mimeType ?? getMimeType(fileName, fileType);

  const compressedUri = await compressIfImage(uri, fileType);
  const bytes = await readFileAsBytes(compressedUri);

  const { error: uploadError } = await supabase.storage
    .from('ticket-attachments')
    .upload(path, bytes, { contentType, upsert: false });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from('ticket_attachments')
    .insert({ ticket_id: ticketId, storage_path: path, file_name: fileName, file_type: fileType })
    .select()
    .single();
  if (error) throw error;
  return data as DbTicketAttachment;
}

export async function deleteAttachment(attachmentId: string, storagePath: string): Promise<void> {
  await supabase.storage.from('ticket-attachments').remove([storagePath]);
  const { error } = await supabase.from('ticket_attachments').delete().eq('id', attachmentId);
  if (error) throw error;
}

export function getAttachmentUrl(path: string): string {
  const { data } = supabase.storage.from('ticket-attachments').getPublicUrl(path);
  return data.publicUrl;
}
