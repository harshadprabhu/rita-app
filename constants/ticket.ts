import { TicketStatus, TicketLifecycle, TicketPriority } from '../types';

// NOTE: Display labels for statuses/lifecycles/priorities are localized via i18n.
// Use t('status.<value>') in components or the helpers in lib/labels.ts elsewhere.

export const STATUS_COLORS: Record<TicketStatus, string> = {
  open: '#3B82F6',
  in_progress: '#F59E0B',
  resolved: '#10B981',
};

export const LIFECYCLE_COLORS: Record<TicketLifecycle, string> = {
  open: '#3B82F6',
  being_worked_on: '#F59E0B',
  pending_your_action: '#8B5CF6',
  escalated: '#EF4444',
  resolved: '#10B981',
  closed: '#6B7280',
};

export const LIFECYCLE_TO_STATUS: Record<TicketLifecycle, TicketStatus> = {
  open: 'open',
  being_worked_on: 'in_progress',
  pending_your_action: 'in_progress',
  escalated: 'in_progress',
  resolved: 'resolved',
  closed: 'resolved',
};

export const PRIORITY_COLORS: Record<TicketPriority, string> = {
  low: '#10B981',
  medium: '#F59E0B',
  high: '#EF4444',
  critical: '#7C2D12',
};

export const ALL_STATUSES: TicketStatus[] = ['open', 'in_progress', 'resolved'];
export const ALL_LIFECYCLES: TicketLifecycle[] = [
  'open', 'being_worked_on', 'pending_your_action', 'escalated', 'resolved', 'closed',
];
export const ALL_PRIORITIES: TicketPriority[] = ['low', 'medium', 'high', 'critical'];
