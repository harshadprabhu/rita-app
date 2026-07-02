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
import { triageMessage } from '../../lib/utils/categoryClassifier';
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
        // Local keyword triage — no AI API key, runs entirely in the app.
        const { category, subcategory, priority, summary } = triageMessage(body);

        if (!profile.store_id) {
          await postBotReply(id, "I couldn't log a ticket because your account has no store assigned. Please ask an admin to set your Store ID.");
        } else {
          const ticket = await createTicket({
            requester_id: profile.id,
            store_id: profile.store_id,
            description: summary,
            long_description: body,
            priority,
            category,
            subcategory,
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
      <View style={[styles.bubble, isOwn ? styles.bubbleOwn : isBot ? styles.bubbleBot : styles.bubbleOther]}>
        {!isOwn && (
          <Text style={styles.senderName}>{isBot ? 'RITA' : message.sender?.display_name ?? ''}</Text>
        )}
        <Text style={[styles.bubbleText, isOwn && styles.bubbleTextOwn]}>{message.body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: theme.spacing.lg, gap: theme.spacing.sm },
  bubbleRow: { alignItems: 'flex-start' },
  bubbleRowOwn: { alignItems: 'flex-end' },
  bubble: { maxWidth: '80%', borderRadius: theme.radius.md, padding: theme.spacing.md, marginBottom: theme.spacing.xs },
  bubbleOwn: { backgroundColor: theme.colors.brand },
  bubbleOther: { backgroundColor: theme.colors.surface2 },
  bubbleBot: { backgroundColor: theme.colors.accentLight },
  senderName: { fontSize: 11, fontWeight: '700', color: theme.colors.textSecondary, marginBottom: 2 },
  bubbleText: { fontSize: 14, color: theme.colors.textPrimary },
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
    flex: 1, backgroundColor: theme.colors.surface2, borderRadius: theme.radius.md, paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm, maxHeight: 100, color: theme.colors.textPrimary, fontSize: 14,
  },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.brand, alignItems: 'center', justifyContent: 'center' },
});
