import { supabase } from '../supabase';
import { DbChatMessage } from '../../types';

export function subscribeToChannelMessages(channelId: string, onInsert: (message: DbChatMessage) => void) {
  const channel = supabase
    .channel(`chat-messages-${channelId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `channel_id=eq.${channelId}` },
      (payload) => onInsert(payload.new as DbChatMessage),
    )
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}
