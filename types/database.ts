export type UserRole = 'user' | 'manager' | 'technician' | 'admin';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type TicketStatus = 'open' | 'in_progress' | 'resolved';
export type TicketLifecycle = 'open' | 'being_worked_on' | 'pending_your_action' | 'escalated' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'critical';
export type TicketSource = 'form' | 'chat_bot';
export type NotificationType =
  | 'ticket_created'
  | 'ticket_updated'
  | 'ticket_assigned'
  | 'ticket_resolved'
  | 'ticket_comment'
  | 'sla_breach'
  | 'broadcast';
export type ChatChannelType = 'group' | 'dm' | 'bot';

export const RITA_BOT_ID = 'rita_bot';

export interface DbDepartment {
  id: string;
  name: string;
  created_at: string;
}

export interface DbStore {
  id: string;
  /** D365 OMOperatingUnitNumber (e.g. 00000968) — internal; not shown to users. */
  code: string;
  name: string;
  city: string | null;
  region: string | null;
  is_active: boolean;
  created_at: string;
  /** D365 RetailChannelId (e.g. NS0040) — the store number staff know. Display this. */
  retail_channel_id: string | null;
}

export interface DbProfile {
  id: string;
  store_id: string | null; // format ST-#### enforced uppercase
  store_name: string | null;
  store_location: string | null;
  first_name: string;
  last_name: string;
  display_name: string; // generated: `${first_name} ${last_name}`
  phone: string | null;
  designation: string | null;
  role: UserRole;
  approval_status: ApprovalStatus;
  is_active: boolean;
  expo_push_token: string | null;
  created_at: string;
}

export interface DbTicket {
  id: string;
  ticket_number: string;
  requester_id: string;
  assignee_id: string | null;
  department_id: string | null;
  store_id: string;
  description: string;
  long_description: string | null;
  status: TicketStatus;
  lifecycle: TicketLifecycle;
  priority: TicketPriority;
  category: string | null;
  subcategory: string | null;
  resolution: string | null;
  resolved_at: string | null;
  source: TicketSource;
  sla_due_at: string | null;
  sla_breached: boolean;
  // Sampark (ManageEngine SDP) linkage — populated once the ticket is mirrored.
  sampark_request_id: string | null;
  sampark_display_id: string | null;
  sampark_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbTicketAttachment {
  id: string;
  ticket_id: string;
  storage_path: string;
  file_name: string | null;
  file_type: 'image' | 'video' | 'document' | null;
  created_at: string;
}

export interface DbTicketComment {
  id: string;
  ticket_id: string;
  author_id: string | null;      // null for notes synced from Sampark
  external_author: string | null; // display name for a synced (non-RITA) author
  sampark_note_id: string | null; // dedup key for Sampark-originated notes
  body: string;
  is_internal: boolean;
  created_at: string;
}

export interface DbTicketAuditLog {
  id: string;
  ticket_id: string;
  actor_id: string | null;
  action: string;
  from_value: string | null;
  to_value: string | null;
  created_at: string;
}

export interface DbNotification {
  id: string;
  recipient_id: string;
  ticket_id: string | null;
  title: string;
  body: string | null;
  type: NotificationType | null;
  is_read: boolean;
  created_at: string;
}

export interface DbBroadcast {
  id: string;
  sender_id: string;
  target_store_id: string | null;
  target_store_ids: string[] | null;
  title: string;
  body: string;
  created_at: string;
}

export interface DbChatChannel {
  id: string;
  type: ChatChannelType;
  store_id: string | null; // set for group channels
  created_at: string;
}

export interface DbChatParticipant {
  id: string;
  channel_id: string;
  profile_id: string;
  created_at: string;
}

export interface DbChatMessage {
  id: string;
  channel_id: string;
  sender_id: string | null; // null/RITA_BOT_ID for bot messages
  body: string;
  ticket_id: string | null; // set when bot confirms a created ticket
  created_at: string;
}

export interface DbAccountAuditLog {
  id: string;
  actor_id: string | null;
  target_profile_id: string;
  action: 'provisioned' | 'updated' | 'activated' | 'deactivated';
  details: string | null;
  created_at: string;
}
