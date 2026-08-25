import { supabase } from '../supabase';
import { DbNotification, NotificationType } from '../../types';
import { sendPushNotifications } from '../utils/pushNotifications';

export async function getNotifications(userId: string): Promise<DbNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('recipient_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as DbNotification[];
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', id);
  if (error) throw error;
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('recipient_id', userId)
    .eq('is_read', false);
  if (error) throw error;
}

/** Remove all of a user's ticket notifications from their inbox. */
export async function deleteAllNotifications(userId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('recipient_id', userId);
  if (error) throw error;
}

export async function createNotification(payload: {
  recipient_id: string;
  ticket_id?: string;
  title: string;
  body: string;
  type: NotificationType;
}): Promise<void> {
  // Write to DB  -- requires INSERT RLS to allow cross-user inserts (see SQL migration).
  // The OS push is fired server-side by the `notification_push` DB trigger
  // (calls send-push with service-role token access) so it works regardless of
  // who created the row / RLS on other users' push tokens.
  const { error } = await supabase.from('notifications').insert(payload);
  if (error) {
    console.error('[createNotification] DB insert failed:', error.message, error.code);
    throw error;
  }
}

export async function notifyTechnicians(
  ticketId: string,
  title: string,
  body: string,
  type: NotificationType,
): Promise<void> {
  // Not restricted to role='technician' -- this org currently has zero
  // technician-role accounts; admins, managers, and ops managers are who
  // actually pick up and resolve tickets in practice (same role set
  // sampark-poll already matches Sampark's assigned technician name
  // against). Filtering to 'technician' alone would alert no one.
  const { data: techs, error: queryError } = await supabase
    .from('profiles')
    .select('id')
    .in('role', ['technician', 'admin', 'manager', 'ops_manager'])
    .eq('approval_status', 'approved')
    .eq('is_active', true);

  if (queryError) {
    console.error('[notifyTechnicians] query failed:', queryError.message);
    return;
  }
  if (!techs?.length) return;

  // Batch DB insert -- requires INSERT RLS to allow cross-user inserts. The OS
  // push for each row is sent server-side by the `notification_push` trigger.
  const rows = techs.map((t) => ({
    recipient_id: t.id as string,
    ticket_id: ticketId,
    title,
    body,
    type,
  }));

  const { error: insertError } = await supabase.from('notifications').insert(rows);
  if (insertError) {
    console.error(
      '[notifyTechnicians] DB insert failed (check notifications INSERT RLS policy):',
      insertError.message,
      insertError.code,
    );
    // Don't throw -- notifications failing must never break ticket creation
  }
}

/**
 * Notify every store-side user of a ticket event so the whole store team
 * (not just the requester) stays aware of status changes without needing to
 * check with each other. Excludes the actor to avoid pinging the person who
 * just performed the action. OS push is fanned out by the notification_push
 * DB trigger, same as notifyTechnicians.
 */
export async function notifyStoreUsers(
  storeId: string,
  excludeUserId: string | null,
  ticketId: string,
  title: string,
  body: string,
  type: NotificationType,
): Promise<void> {
  const { data: users, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('store_id', storeId)
    .in('role', ['user', 'in_store_manager'])
    .eq('approval_status', 'approved')
    .eq('is_active', true);
  if (error) {
    console.error('[notifyStoreUsers] query failed:', error.message);
    return;
  }
  const rows = (users ?? [])
    .filter((u) => u.id !== excludeUserId)
    .map((u) => ({ recipient_id: u.id as string, ticket_id: ticketId, title, body, type }));
  if (!rows.length) return;

  const { error: insertError } = await supabase.from('notifications').insert(rows);
  if (insertError) {
    console.error('[notifyStoreUsers] DB insert failed:', insertError.message, insertError.code);
  }
}

/**
 * Send a broadcast push to all relevant users.
 * targetStoreIds (multi) takes priority over targetStoreId (legacy single).
 * If neither is supplied every registered device receives the push.
 */
export async function notifyBroadcast(
  title: string,
  body: string,
  targetStoreId?: string | null,
  targetStoreIds?: string[],
): Promise<void> {
  let query = supabase
    .from('profiles')
    .select('expo_push_token')
    .not('expo_push_token', 'is', null);

  if (targetStoreIds && targetStoreIds.length > 0) {
    query = query.in('store_id', targetStoreIds);
  } else if (targetStoreId) {
    query = query.eq('store_id', targetStoreId);
  }

  const { data } = await query;
  if (!data?.length) return;

  const messages = (data as { expo_push_token: string | null }[])
    .filter((p) => !!p.expo_push_token)
    .map((p) => ({
      to: p.expo_push_token as string,
      title,
      body,
      sound: 'default' as const,
      data: { type: 'broadcast' },
    }));
  await sendPushNotifications(messages).catch(() => null);
}
