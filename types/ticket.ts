import { DbTicket, DbTicketAttachment, DbTicketComment, DbTicketAuditLog, DbProfile, DbStore } from './database';

export interface TicketWithRelations extends DbTicket {
  requester: Pick<DbProfile, 'id' | 'display_name' | 'designation'> | null;
  assignee: Pick<DbProfile, 'id' | 'display_name' | 'designation'> | null;
  store: Pick<DbStore, 'id' | 'name' | 'code' | 'city'> | null;
  attachments: DbTicketAttachment[];
}

export interface CommentWithAuthor extends DbTicketComment {
  author: Pick<DbProfile, 'id' | 'display_name' | 'role'> | null;
}

export interface AuditLogWithActor extends DbTicketAuditLog {
  actor: Pick<DbProfile, 'id' | 'display_name' | 'role'> | null;
}

export interface CreateTicketPayload {
  description: string;
  long_description?: string;
  priority: DbTicket['priority'];
  store_id: string;
  source?: DbTicket['source'];
  images: { uri: string; name: string }[];
}
