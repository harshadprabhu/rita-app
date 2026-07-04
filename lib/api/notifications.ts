import { supabase } from '../supabase';
import { DbNotification, NotificationType } from '../../types';
import { sendPushNotifications, sendPushToToken } from '../utils/pushNotifications';

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
  // Write to DB  -- requires INSERT RLS to allow cross-user inserts (see SQL migration)
  const { error } = await supabase.from('notifications').insert(payload);
  if (error) {
    console.error('[createNotification] DB insert failed:', error.message, error.code);
    throw error;
  }

  // Fetch recipient push token and fire push (best-effort -- never throws)
  void (async () => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('expo_push_token')
        .eq('id', payload.recipient_id)
        .single();
      if (data?.expo_push_token) {
        await sendPushToToken(data.expo_push_token, payload.title, payload.body, {
          ticketId: payload.ticket_id,
          type: payload.type,
        });
      }
    } catch (err: unknown) {
      console.error('[createNotification] push failed:', err);
    }
  })();
}

export async function notifyTechnicians(
  ticketId: string,
  title: string,
  body: string,
  type: NotificationType,
): Promise<void> {
  const { data: techs, error: queryError } = await supabase
    .from('profiles')
    .select('id, expo_push_token')
    .eq('role', 'technician')
    .eq('approval_status', 'approved');

  if (queryError) {
    console.error('[notifyTechnicians] query failed:', queryError.message);
    return;
  }
  if (!techs?.length) return;

  // Batch DB insert -- requires INSERT RLS to allow cross-user inserts
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

  // Send push to all techs that have a token (fire-and-forget)
  const pushMessages = (techs as { id: string; expo_push_token: string | null }[])
    .filter((t) => !!t.expo_push_token)
    .map((t) => ({
      to: t.expo_push_token as string,
      title,
      body,
      sound: 'default' as const,
      data: { ticketId, type },
    }));
  sendPushNotifications(pushMessages).catch((err) =>
    console.error('[notifyTechnicians] push send failed:', err),
  );
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
