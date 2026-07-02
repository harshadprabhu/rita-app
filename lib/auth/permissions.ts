import { DbProfile, DbTicket } from '../../types';

export function canViewTicket(profile: DbProfile, ticket: DbTicket): boolean {
  if (profile.role === 'admin' || profile.role === 'technician') return true;
  if (profile.role === 'manager') return ticket.store_id === profile.store_id;
  return ticket.requester_id === profile.id;
}

export function canAssignTicket(profile: DbProfile): boolean {
  return profile.role === 'technician' || profile.role === 'admin';
}

export function canChangeStatus(profile: DbProfile): boolean {
  return profile.role === 'technician' || profile.role === 'admin';
}

export function canSeeInternalComments(profile: DbProfile): boolean {
  return profile.role === 'technician' || profile.role === 'admin' || profile.role === 'manager';
}

export function canSendBroadcast(profile: DbProfile): boolean {
  return profile.role === 'technician' || profile.role === 'admin';
}

export function canApproveUsers(profile: DbProfile): boolean {
  return profile.role === 'admin';
}

export function canManageAccounts(profile: DbProfile): boolean {
  return profile.role === 'admin';
}

export function canViewAnalytics(profile: DbProfile): boolean {
  return profile.role === 'admin' || profile.role === 'manager';
}

export function canReassignTicket(profile: DbProfile): boolean {
  return profile.role === 'admin' || profile.role === 'manager';
}
