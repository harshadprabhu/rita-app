import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, KeyboardAvoidingView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/common/Screen';
import { CommentInput } from '../../components/tickets/CommentInput';
import { LoadingOverlay } from '../../components/common/LoadingOverlay';
import { supabase } from '../../lib/supabase';
import { getProfile } from '../../lib/api/profiles';
import { getConversation, sendDirectMessage, markConversationRead, DirectMessage } from '../../lib/api/directMessages';
import { useOnlineTechnicians } from '../../hooks/useTechnicianPresence';
import { useAuthStore } from '../../stores/authStore';
import { useUiStore } from '../../stores/uiStore';
import { timeAgo } from '../../lib/utils/date';
import { theme } from '../../constants/theme';

// 1:1 in-app direct message between the current user and a technician. Lives
// entirely in Supabase (no Sampark equivalent) with realtime delivery.
export default function DirectMessageScreen() {
  const { technicianId } = useLocalSearchParams<{ technicianId: string }>();
  const me = useAuthStore((s) => s.profile);
  const qc = useQueryClient();
  const showToast = useUiStore((s) => s.showToast);
  const online = useOnlineTechnicians();

  const { data: other } = useQuery({ queryKey: ['profile', technicianId], queryFn: () => getProfile(technicianId), enabled: !!technicianId });
  const { data: messages, isPending } = useQuery({
    queryKey: ['dm', me?.id, technicianId],
    queryFn: () => getConversation(me!.id, technicianId),
    enabled: !!me?.id && !!technicianId,
  });

  const [pending, setPending] = useState<DirectMessage[]>([]);

  // Realtime: any new DM between me and them lands instantly.
  useEffect(() => {
    if (!me?.id || !technicianId) return;
    const name = `dm:${me.id}:${technicianId}:${Math.random().toString(36).slice(2, 7)}`;
    const channel = supabase
      .channel(name)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages' }, (payload) => {
        const m = payload.new as DirectMessage;
        const inThread = (m.sender_id === me.id && m.recipient_id === technicianId) || (m.sender_id === technicianId && m.recipient_id === me.id);
        if (!inThread) return;
        qc.setQueryData<DirectMessage[]>(['dm', me.id, technicianId], (prev) => {
          const list = prev ?? [];
          if (list.some((x) => x.id === m.id)) return list;
          return [...list, m];
        });
        setPending((prev) => prev.filter((p) => p.body !== m.body || m.sender_id !== me.id));
        if (m.recipient_id === me.id) markConversationRead(me.id, technicianId).catch(() => {});
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [me?.id, technicianId, qc]);

  // Mark their messages read on open.
  useEffect(() => {
    if (me?.id && technicianId) markConversationRead(me.id, technicianId).catch(() => {});
  }, [me?.id, technicianId, messages?.length]);

  const sendM = useMutation({
    mutationFn: (body: string) => sendDirectMessage(technicianId, body),
    onError: (err) => showToast(err instanceof Error ? err.message : 'Message not sent', 'error'),
  });

  const send = (body: string) => {
    // Optimistic echo; realtime INSERT reconciles it by body match.
    setPending((prev) => [...prev, { id: `tmp-${Date.now()}`, sender_id: me!.id, recipient_id: technicianId, body, created_at: new Date().toISOString(), read_at: null }]);
    sendM.mutate(body);
  };

  if (!me) return <LoadingOverlay />;

  const isOnline = online.has(technicianId);
  const all = [...(messages ?? []), ...pending.filter((p) => !(messages ?? []).some((m) => m.body === p.body && m.sender_id === p.sender_id))];

  return (
    <Screen edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={0}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="chevron-back" size={26} color="#fff" />
          </TouchableOpacity>
          <View style={styles.avatar}><Text style={styles.avatarText}>{(other?.display_name ?? '?').slice(0, 2).toUpperCase()}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerName} numberOfLines={1}>{other?.display_name ?? 'Technician'}</Text>
            <View style={styles.statusRow}>
              <View style={[styles.dot, { backgroundColor: isOnline ? '#22C55E' : '#9CA3AF' }]} />
              <Text style={styles.statusText}>{isOnline ? 'Available now' : 'Offline'}</Text>
            </View>
          </View>
        </View>

        {isPending ? (
          <View style={styles.loading}><ActivityIndicator color={theme.colors.brand} /></View>
        ) : (
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="always">
            {all.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="chatbubbles-outline" size={40} color={theme.colors.textTertiary} />
                <Text style={styles.emptyText}>Say hello — ask {other?.display_name?.split(' ')[0] ?? 'them'} to pick up your ticket, or just chat.</Text>
              </View>
            ) : (
              all.map((m) => {
                const mine = m.sender_id === me.id;
                return (
                  <View key={m.id} style={[styles.row, mine ? styles.rowRight : styles.rowLeft]}>
                    <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                      <Text style={[styles.body, mine && styles.bodyMine]}>{m.body}</Text>
                      <Text style={[styles.time, mine && styles.timeMine]}>{timeAgo(m.created_at)}</Text>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
        )}

        <CommentInput canMarkInternal={false} onSubmit={(body) => send(body)} />
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm,
    backgroundColor: theme.colors.brand, paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.md,
  },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: theme.colors.accent, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  headerName: { color: '#fff', fontSize: 16, fontWeight: '800' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '600' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: theme.spacing.md, flexGrow: 1, backgroundColor: '#F5F6FA' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: theme.spacing.xl, paddingVertical: theme.spacing.xxl },
  emptyText: { fontSize: 14, color: theme.colors.textTertiary, fontWeight: '600', textAlign: 'center', lineHeight: 20 },
  row: { flexDirection: 'row', marginVertical: 3 },
  rowLeft: { justifyContent: 'flex-start' },
  rowRight: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '78%', paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm, borderRadius: 14, ...theme.shadows.xs },
  bubbleMine: { backgroundColor: theme.colors.brand, borderBottomRightRadius: 3 },
  bubbleTheirs: { backgroundColor: '#fff', borderWidth: 1, borderColor: theme.colors.border, borderBottomLeftRadius: 3 },
  body: { fontSize: 15, color: theme.colors.textPrimary, lineHeight: 21 },
  bodyMine: { color: '#fff' },
  time: { fontSize: 10, color: theme.colors.textTertiary, marginTop: 3, textAlign: 'right' },
  timeMine: { color: 'rgba(255,255,255,0.6)' },
});
