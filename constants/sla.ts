import { TicketPriority } from '../types';

// Hours allowed before a ticket is considered SLA-breached, by priority.
export const SLA_HOURS: Record<TicketPriority, number> = {
  critical: 1,
  high: 4,
  medium: 24,
  low: 72,
};

export function computeSlaDueAt(priority: TicketPriority, createdAt: Date = new Date()): Date {
  const due = new Date(createdAt);
  due.setHours(due.getHours() + SLA_HOURS[priority]);
  return due;
}
