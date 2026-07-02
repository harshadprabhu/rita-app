import { DbNotification } from './database';

export interface NotificationWithTicket extends DbNotification {
  ticket_number?: string;
}
