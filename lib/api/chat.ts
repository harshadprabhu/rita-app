import { supabase } from '../supabase';
import { DbChatChannel, DbChatMessage } from '../../types';
import { ChatMessageWithSender } from '../../types/chat';

export async function getOrCreateGroupChannel(storeId: string): Promise<DbChatChannel> {
  const { data: existing } = await supabase
    .from('chat_channels')
    .select('*')
    .eq('type', 'group')
    .eq('store_id', storeId)
    .maybeSingle();
  if (existing) return existing as DbChatChannel;

  const { data, error } = await supabase
    .from('chat_channels')
    .insert({ type: 'group', store_id: storeId })
    .select()
    .single();
  if (error) throw error;
  return data as DbChatChannel;
}

export async function getOrCreateBotChannel(profileId: string): Promise<DbChatChannel> {
  const { data: participantRow } = await supabase
    .from('chat_participants')
    .select('channel_id, channel:chat_channels!inner(*)')
    .eq('profile_id', profileId)
    .eq('channel.type', 'bot')
    .maybeSingle();
  if (participantRow?.channel) return participantRow.channel as unknown as DbChatChannel;

  const { data: channel, error } = await supabase
    .from('chat_channels')
    .insert({ type: 'bot', store_id: null })
    .select()
    .single();
  if (error) throw error;

  await supabase.from('chat_participants').insert([
    { channel_id: channel.id, profile_id: profileId },
  ]);

  return channel as DbChatChannel;
}

export async function getChannel(channelId: string): Promise<DbChatChannel> {
  const { data, error } = await supabase.from('chat_channels').select('*').eq('id', channelId).single();
  if (error) throw error;
  return data as DbChatChannel;
}

export async function getMessages(channelId: string): Promise<ChatMessageWithSender[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*, sender:profiles(id, display_name, role)')
    .eq('channel_id', channelId)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as unknown as ChatMessageWithSender[];
}

export async function sendMessage(channelId: string, senderId: string, body: string): Promise<DbChatMessage> {
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({ channel_id: channelId, sender_id: senderId, body })
    .select()
    .single();
  if (error) throw error;
  return data as DbChatMessage;
}

// Bot messages have sender_id = null; UI renders rows with null sender as RITA.
export async function postBotReply(channelId: string, body: string, ticketId?: string): Promise<DbChatMessage> {
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({ channel_id: channelId, sender_id: null, body, ticket_id: ticketId ?? null })
    .select()
    .single();
  if (error) throw error;
  return data as DbChatMessage;
}
