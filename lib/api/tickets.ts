import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '../supabase';
import { DbTicket, TicketStatus, TicketLifecycle, TicketPriority, DbTicketAttachment } from '../../types';
import { TicketWithRelations } from '../../types/ticket';
import { computeSlaDueAt } from '../../constants/sla';
import { logTicketAction } from './auditLog';

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
  return data as DbTicket;
}

export async function updateTicket(
  id: string,
  updates: Partial<Pick<DbTicket, 'status' | 'lifecycle' | 'priority' | 'assignee_id' | 'resolution' | 'resolved_at' | 'category' | 'subcategory' | 'description' | 'long_description' | 'department_id'>>,
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
  const { error } = await supabase.from('tickets').delete().eq('id', ticketId);
  if (error) throw error;
}

function getMimeType(fileName: string, fileType: 'image' | 'video' | 'document'): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (fileType === 'image') {
    const map: Record<string, string> = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      gif: 'image/gif', webp: 'image/webp', heic: 'image/heic',
    };
    return map[ext] ?? 'image/jpeg';
  }
  if (fileType === 'video') {
    const map: Record<string, string> = {
      mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo',
      mkv: 'video/x-matroska', webm: 'video/webm',
    };
    return map[ext] ?? 'video/mp4';
  }
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    txt: 'text/plain',
    csv: 'text/csv',
  };
  return map[ext] ?? 'application/octet-stream';
}

async function readFileAsBytes(uri: string): Promise<Uint8Array> {
  // On web the picker yields a blob:/data: URL that expo-file-system can't
  // read — fetch it straight into bytes instead. This is why photo upload
  // silently failed in the browser.
  if (Platform.OS === 'web') {
    const res = await fetch(uri);
    return new Uint8Array(await res.arrayBuffer());
  }

  let fileUri = uri;
  if (!uri.startsWith('file://')) {
    const dest = FileSystem.cacheDirectory + `upload_${Date.now()}`;
    await FileSystem.copyAsync({ from: uri, to: dest });
    fileUri = dest;
  }

  const base64 = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

const MAX_IMAGE_DIMENSION = 1600;
const IMAGE_COMPRESS_QUALITY = 0.7;

/**
 * Downscale + recompress large images client-side before they hit Firestore/Storage
 * transit. Skips non-image attachments untouched.
 */
async function compressIfImage(uri: string, fileType: 'image' | 'video' | 'document'): Promise<string> {
  if (fileType !== 'image') return uri;
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: MAX_IMAGE_DIMENSION } }],
      { compress: IMAGE_COMPRESS_QUALITY, format: ImageManipulator.SaveFormat.JPEG },
    );
    return result.uri;
  } catch {
    // If manipulation fails (e.g. unsupported format), fall back to the original.
    return uri;
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
