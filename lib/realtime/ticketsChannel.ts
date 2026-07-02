import { supabase } from '../supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

export function subscribeToTickets(onInsert: () => void): RealtimeChannel {
  return supabase
    .channel('tickets-channel')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tickets' }, onInsert)
    .subscribe();
}

export function subscribeToTicket(
  ticketId: string,
  onUpdate: () => void,
): RealtimeChannel {
  return supabase
    .channel(`ticket-${ticketId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'tickets', filter: `id=eq.${ticketId}` },
      onUpdate,
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'ticket_comments', filter: `ticket_id=eq.${ticketId}` },
      onUpdate,
    )
    .subscribe();
}

export function subscribeToNotifications(
  userId: string,
  onInsert: () => void,
): RealtimeChannel {
  return supabase
    .channel(`notifications-${userId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}` },
      onInsert,
    )
    .subscribe();
}
