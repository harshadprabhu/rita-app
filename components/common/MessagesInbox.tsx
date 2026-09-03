import React, { useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from './Screen';
import { AppHeader } from './AppHeader';
import { ProfileIconButton } from './ProfileIconButton';
import { EmptyState } from './EmptyState';
import { LoadingOverlay } from './LoadingOverlay';
import { getConversationList, DmConversation } from '../../lib/api/directMessages';
import { getProfile } from '../../lib/api/profiles';
import { useOnlineTechnicians } from '../../hooks/useTechnicianPresence';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { timeAgo } from '../../lib/utils/date';
import { theme } from '../../constants/theme';

// A direct-message inbox: the list of people you've been chatting with. Used
// by technicians (their incoming DMs from users) — tap to open the thread.
export function MessagesInbox() {
  const me = useAuthStore((s) => s.profile);
  const online = useOnlineTechnicians();

  const { data: convos, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['dm-conversations', me?.id],
    queryFn: () => getConversationList(me!.id),
    enabled: !!me?.id,
    refetchInterval: 10000,
  });

  // Realtime bump when any DM involving me lands.
  useEffect(() => {
    if (!me?.id) return;
    const ch = supabase
      .channel(`dm-inbox:${me.id}:${Math.random().toString(36).slice(2, 7)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages' }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [me?.id, refetch]);

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader title="Messages" right={me ? <ProfileIconButton profile={me} /> : undefined} />
      {isLoading ? (
        <LoadingOverlay />
      ) : (
        <FlatList
          data={convos ?? []}
          keyExtractor={(c) => c.otherId}
          renderItem={({ item }) => <ConversationRow convo={item} online={online.has(item.otherId)} />}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
          ListEmptyComponent={<EmptyState icon="chatbubbles-outline" title="No messages yet" subtitle="When someone messages you, it'll show up here." />}
        />
      )}
    </Screen>
  );
}

function ConversationRow({ convo, online }: { convo: DmConversation; online: boolean }) {
  const { data: other } = useQuery({ queryKey: ['profile', convo.otherId], queryFn: () => getProfile(convo.otherId) });
  return (
    <TouchableOpacity style={styles.row} activeOpacity={0.75} onPress={() => router.push(`/dm/${convo.otherId}` as never)}>
      <View style={styles.avatarWrap}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{(other?.display_name ?? '?').slice(0, 2).toUpperCase()}</Text></View>
        {online && <View style={styles.dot} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>{other?.display_name ?? 'User'}</Text>
        <Text style={[styles.preview, convo.unread > 0 && styles.previewUnread]} numberOfLines={1}>
          {convo.lastFromMe ? 'You: ' : ''}{convo.lastBody}
        </Text>
      </View>
      <View style={styles.meta}>
        <Text style={styles.time}>{timeAgo(convo.lastAt)}</Text>
        {convo.unread > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{convo.unread}</Text></View>}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  list: { padding: theme.spacing.md, gap: theme.spacing.sm, flexGrow: 1 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md,
    backgroundColor: theme.colors.surface, borderRadius: 14, padding: theme.spacing.md,
    borderWidth: 1, borderColor: theme.colors.border, ...theme.shadows.xs,
  },
  avatarWrap: { position: 'relative' },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: theme.colors.brand, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  dot: { position: 'absolute', right: -1, bottom: -1, width: 14, height: 14, borderRadius: 7, backgroundColor: '#22C55E', borderWidth: 2, borderColor: theme.colors.surface },
  name: { fontSize: 15, fontWeight: '700', color: theme.colors.textPrimary },
  preview: { fontSize: 13, color: theme.colors.textTertiary, marginTop: 2 },
  previewUnread: { color: theme.colors.textPrimary, fontWeight: '600' },
  meta: { alignItems: 'flex-end', gap: 4 },
  time: { fontSize: 11, color: theme.colors.textTertiary },
  badge: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: theme.colors.error, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
});
