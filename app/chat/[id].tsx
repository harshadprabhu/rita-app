import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Screen } from '../../components/common/Screen';
import { AppHeader } from '../../components/common/AppHeader';
import { getChannel, getMessages, sendMessage, postBotReply } from '../../lib/api/chat';
import { subscribeToChannelMessages } from '../../lib/realtime/chatChannel';
import { createTicket } from '../../lib/api/tickets';
import { shouldCreateTicket, parseChatTicket, canRaiseChatTicket } from '../../lib/utils/chatTicketParser';
import { useAuthStore } from '../../stores/authStore';
import { PRESET_SCENARIOS } from '../../constants/presetScenarios';
import { ChatMessageWithSender } from '../../types/chat';
import { theme } from '../../constants/theme';

export default function ChatThread() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const profile = useAuthStore((s) => s.profile);
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [botThinking, setBotThinking] = useState(false);
  const listRef = useRef<FlatList>(null);

  const { data: channel } = useQuery({ queryKey: ['chat-channel', id], queryFn: () => getChannel(id) });
  const { data: messages } = useQuery({ queryKey: ['chat-messages', id], queryFn: () => getMessages(id) });

  useEffect(() => {
    const unsubscribe = subscribeToChannelMessages(id, () => {
      queryClient.invalidateQueries({ queryKey: ['chat-messages', id] });
    });
    return unsubscribe;
  }, [id]);

  const isBotChannel = channel?.type === 'bot';

  const handleSend = async (overrideText?: string) => {
    const body = (overrideText ?? text).trim();
    if (!body || !profile) return;
    setText('');
    await sendMessage(id, profile.id, body);
    queryClient.invalidateQueries({ queryKey: ['chat-messages', id] });

    if (isBotChannel) {
      setBotThinking(true);
      try {
        // Local keyword parser — no AI API key, runs entirely in the app.
        // Technicians/admins are exempt from raising tickets (avoids triage loops),
        // and purely conversational messages don't create tickets.
        if (!canRaiseChatTicket(profile.role)) {
          await postBotReply(id, "Thanks for the message. Technician and admin accounts don't raise tickets here — this channel logs issues reported by store staff.");
        } else if (!shouldCreateTicket(body)) {
          await postBotReply(id, "Thanks! I didn't detect an issue to log. If you have a problem to report, describe it (e.g. \"POS not printing\" or \"price mismatch on SKU\") and I'll raise a ticket.");
        } else if (!profile.store_id) {
          await postBotReply(id, "I couldn't log a ticket because your account has no store assigned. Please ask an admin to set your Store ID.");
        } else {
          const { category, priority, summary } = parseChatTicket(body);
          const ticket = await createTicket({
            requester_id: profile.id,
            store_id: profile.store_id,
            description: summary,
            long_description: body,
            priority,
            category,
            subcategory: null,
            source: 'chat_bot',
          });
          await postBotReply(
            id,
            `Got it — I've logged ticket ${ticket.ticket_number} ` +
              `(${t(`category.${category}`)} · ${priority} priority). A technician will follow up shortly.`,
            ticket.id,
          );
        }
      } catch {
        await postBotReply(id, "Sorry, something went wrong while logging your ticket. Please try again.").catch(() => null);
      } finally {
        setBotThinking(false);
        queryClient.invalidateQueries({ queryKey: ['chat-messages', id] });
        queryClient.invalidateQueries({ queryKey: ['tickets'] });
      }
    }
  };

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader title={isBotChannel ? t('chat.ritaBot') : t('chat.group')} showBack />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        <FlatList
          ref={listRef}
          data={messages ?? []}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <MessageBubble message={item} isOwn={item.sender_id === profile?.id} />}
          contentContainerStyle={styles.list}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        />

        {isBotChannel && (
          <FlatList
            data={PRESET_SCENARIOS}
            horizontal
            keyExtractor={(item) => item.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.presets}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.presetChip} onPress={() => handleSend(item.message)}>
                <Text style={styles.presetChipText}>{item.label}</Text>
              </TouchableOpacity>
            )}
          />
        )}

        {botThinking && (
          <View style={styles.thinkingRow}>
            <ActivityIndicator size="small" color={theme.colors.brand} />
            <Text style={styles.thinkingText}>RITA is triaging…</Text>
          </View>
        )}

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder={t('chat.typeMessage')}
            placeholderTextColor={theme.colors.textTertiary}
            multiline
          />
          <TouchableOpacity style={styles.sendBtn} onPress={() => handleSend()}>
            <Ionicons name="send" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function MessageBubble({ message, isOwn }: { message: ChatMessageWithSender; isOwn: boolean }) {
  const isBot = message.sender_id === null;
  return (
    <View style={[styles.bubbleRow, isOwn && styles.bubbleRowOwn]}>
      {isBot && !isOwn && (
        <View style={styles.botAvatar}>
          <Ionicons name="sparkles" size={13} color="#fff" />
        </View>
      )}
      <View style={[
        styles.bubble, theme.shadows.xs,
        isOwn ? styles.bubbleOwn : isBot ? styles.bubbleBot : styles.bubbleOther,
      ]}>
        {!isOwn && !isBot && (
          <Text style={styles.senderName}>{message.sender?.display_name ?? ''}</Text>
        )}
        {isBot && <Text style={styles.senderNameBot}>RITA</Text>}
        <Text style={[styles.bubbleText, isOwn && styles.bubbleTextOwn]}>{message.body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: theme.spacing.lg, gap: theme.spacing.sm },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing.xs },
  bubbleRowOwn: { justifyContent: 'flex-end' },
  botAvatar: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: theme.colors.accent,
    alignItems: 'center', justifyContent: 'center', marginBottom: 2,
  },
  bubble: { maxWidth: '78%', borderRadius: theme.radius.lg, padding: theme.spacing.md, marginBottom: theme.spacing.xs },
  bubbleOwn: { backgroundColor: theme.colors.brand, borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderBottomLeftRadius: 4 },
  bubbleBot: { backgroundColor: theme.colors.accentLight, borderWidth: 1, borderColor: theme.colors.accent + '33', borderBottomLeftRadius: 4 },
  senderName: { fontSize: 11, fontWeight: '700', color: theme.colors.textSecondary, marginBottom: 2 },
  senderNameBot: { fontSize: 11, fontWeight: '800', color: '#946E1E', marginBottom: 2, letterSpacing: 0.3 },
  bubbleText: { fontSize: 14, color: theme.colors.textPrimary, lineHeight: 20 },
  bubbleTextOwn: { color: '#fff' },
  presets: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.sm, gap: theme.spacing.sm },
  presetChip: {
    backgroundColor: theme.colors.surface2, borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: theme.radius.full, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm, marginRight: theme.spacing.sm,
  },
  presetChipText: { fontSize: 12, color: theme.colors.textPrimary, fontWeight: '600' },
  thinkingRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.xs },
  thinkingText: { fontSize: 12, color: theme.colors.textSecondary },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing.sm, padding: theme.spacing.md,
    borderTopWidth: 1, borderTopColor: theme.colors.border, backgroundColor: theme.colors.surface,
  },
  input: {
    flex: 1, backgroundColor: theme.colors.surface2, borderRadius: theme.radius.xl, paddingHorizontal: theme.spacing.md + 2,
    paddingVertical: theme.spacing.sm + 2, maxHeight: 100, color: theme.colors.textPrimary, fontSize: 14,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: theme.colors.brand,
    alignItems: 'center', justifyContent: 'center', ...theme.shadows.brand,
  },
});
