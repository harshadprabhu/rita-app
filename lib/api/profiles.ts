import { supabase } from '../supabase';
import { DbProfile, UserRole, ApprovalStatus } from '../../types';

export async function getProfile(id: string): Promise<DbProfile> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as DbProfile;
}

export async function updateProfile(id: string, updates: Partial<DbProfile>): Promise<DbProfile> {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as DbProfile;
}

export async function updatePushToken(id: string, token: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ expo_push_token: token })
    .eq('id', id);
  if (error) throw error;
}

export async function getPendingTechnicians(): Promise<DbProfile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'technician' satisfies UserRole)
    .eq('approval_status', 'pending' satisfies ApprovalStatus)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as DbProfile[];
}

export async function getTechnicians(): Promise<DbProfile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'technician' satisfies UserRole)
    .eq('approval_status', 'approved' satisfies ApprovalStatus);
  if (error) throw error;
  return (data ?? []) as DbProfile[];
}

export async function updateApprovalStatus(
  id: string,
  status: ApprovalStatus,
): Promise<void> {
  const { data, error } = await supabase
    .from('profiles')
    .update({ approval_status: status })
    .eq('id', id)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('Update blocked — check UPDATE RLS policy on profiles table');
  }
}

// --- Account management (Phase 5) ---

export interface ProvisionAccountPayload {
  first_name: string;
  last_name: string;
  phone: string | null;
  role: UserRole;
  store_id: string | null;
  store_name: string | null;
  store_location: string | null;
  designation: string | null;
}

export async function getAccounts(filters?: { role?: UserRole; storeId?: string }): Promise<DbProfile[]> {
  let query = supabase.from('profiles').select('*').order('created_at', { ascending: false });
  if (filters?.role) query = query.eq('role', filters.role);
  if (filters?.storeId) query = query.eq('store_id', filters.storeId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as DbProfile[];
}

export async function setAccountActive(id: string, isActive: boolean, actorId: string): Promise<void> {
  const { error } = await supabase.from('profiles').update({ is_active: isActive }).eq('id', id);
  if (error) throw error;
  await supabase.from('account_audit_log').insert({
    actor_id: actorId,
    target_profile_id: id,
    action: isActive ? 'activated' : 'deactivated',
  });
}

// Head-office store that admins, managers, and technicians default to — they
// aren't tied to a retail location like store staff are. Kept in sync with the
// manually-seeded stores row (supabase/store-sync-cron.sql notes).
const HEAD_OFFICE = {
  store_id: 'HO-PRABHADEVI',
  store_name: 'HO OIC Prabhadevi',
  store_location: 'Mumbai',
} as const;

const ELEVATED_ROLES: UserRole[] = ['admin', 'manager', 'technician'];

/**
 * Admin-only role assignment. Promoting a user to technician/manager/admin also
 * approves them (self-registration was removed; the admin's action *is* the
 * approval) and, if they have no store, defaults them to the head office —
 * elevated roles aren't tied to a retail store. Relies on the "profiles: admin
 * manage" RLS policy that grants admins ALL on profiles.
 */
export async function setAccountRole(id: string, role: UserRole, actorId: string): Promise<void> {
  const updates: Partial<DbProfile> = { role, approval_status: 'approved' satisfies ApprovalStatus };

  // Give elevated roles a head-office store if they don't already have one.
  if (ELEVATED_ROLES.includes(role)) {
    const { data: current } = await supabase.from('profiles').select('store_id').eq('id', id).single();
    if (!(current as { store_id?: string } | null)?.store_id) {
      Object.assign(updates, HEAD_OFFICE);
    }
  }

  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', id)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('Update blocked — admin RLS policy on profiles may be missing');
  }
  await supabase.from('account_audit_log').insert({
    actor_id: actorId,
    target_profile_id: id,
    action: 'updated', // account_action enum; role detail lives in the change itself
  });
}

export async function getAccountAuditLog() {
  const { data, error } = await supabase
    .from('account_audit_log')
    .select('*, target:profiles!account_audit_log_target_profile_id_fkey(id, display_name), actor:profiles!account_audit_log_actor_id_fkey(id, display_name)')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return data ?? [];
}
