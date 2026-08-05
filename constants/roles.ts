import { UserRole } from '../types';

export const ROLE_LABELS: Record<UserRole, string> = {
  user: 'Store Staff',
  manager: 'Manager',
  technician: 'Technician',
  admin: 'Admin',
  ops_manager: 'Ops Manager',
  in_store_manager: 'In-Store Manager',
};

/** Ops Manager = Manager rights + promotions. Uses the (manager) screens. */
export function isManagerLevel(role: UserRole): boolean {
  return role === 'manager' || role === 'ops_manager';
}

/** In-Store Manager currently mirrors Store Staff. Uses the (user) screens. */
export function isUserLevel(role: UserRole): boolean {
  return role === 'user' || role === 'in_store_manager';
}

/** Only Ops Managers (and admins) may publish promotions. */
export function canPushPromotions(role: UserRole): boolean {
  return role === 'ops_manager' || role === 'admin';
}

/** Only In-Store Managers (and admins) fill the Saksham daily checklists. */
export function canFillChecklists(role: UserRole): boolean {
  return role === 'in_store_manager' || role === 'admin';
}

/** Ops Managers (and admins) review checklist submissions across stores. */
export function canReviewChecklists(role: UserRole): boolean {
  return role === 'ops_manager' || role === 'admin';
}
