import { DbChatChannel, DbChatMessage, DbProfile } from './database';

export interface ChatMessageWithSender extends DbChatMessage {
  sender: Pick<DbProfile, 'id' | 'display_name' | 'role'> | null;
}

export interface ChatChannelWithMeta extends DbChatChannel {
  participant_ids: string[];
  last_message: DbChatMessage | null;
  unread_count: number;
}

export interface PresetScenario {
  id: string;
  label: string;
  message: string;
}
