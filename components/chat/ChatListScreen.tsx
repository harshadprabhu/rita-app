import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Screen } from '../common/Screen';
import { AppHeader } from '../common/AppHeader';
import { ProfileIconButton } from '../common/ProfileIconButton';
import { getOrCreateGroupChannel, getOrCreateBotChannel } from '../../lib/api/chat';
import { useAuthStore } from '../../stores/authStore';
import { theme } from '../../constants/theme';

export function ChatListScreen() {
  const { t } = useTranslation();
  const profile = useAuthStore((s) => s.profile);

  const { data: groupChannel } = useQuery({
    queryKey: ['group-channel', profile?.store_id],
    queryFn: () => getOrCreateGroupChannel(profile!.store_id!),
    enabled: !!profile?.store_id,
  });

  const { data: botChannel } = useQuery({
    queryKey: ['bot-channel', profile?.id],
    queryFn: () => getOrCreateBotChannel(profile!.id),
    enabled: !!profile,
  });

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader title={t('tabs.chat')} right={profile ? <ProfileIconButton profile={profile} /> : null} />
      <View style={styles.list}>
        {botChannel && (
          <ChatRow
            icon="sparkles"
            color="#7C3AED"
            title={t('chat.ritaBot')}
            subtitle="Describe an issue — I'll log a ticket for you"
            onPress={() => router.push(`/chat/${botChannel.id}`)}
          />
        )}
        {groupChannel && (
          <ChatRow
            icon="people"
            color={theme.colors.brand}
            title={t('chat.group')}
            subtitle={profile?.store_name ?? 'Store-wide chat'}
            onPress={() => router.push(`/chat/${groupChannel.id}`)}
          />
        )}
      </View>
    </Screen>
  );
}

function ChatRow(props: { icon: keyof typeof Ionicons.glyphMap; color: string; title: string; subtitle: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.row, theme.shadows.sm]} onPress={props.onPress} activeOpacity={0.8}>
      <View style={[styles.iconBox, { backgroundColor: props.color + '22' }]}>
        <Ionicons name={props.icon} size={22} color={props.color} />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{props.title}</Text>
        <Text style={styles.rowSubtitle} numberOfLines={1}>{props.subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  list: { padding: theme.spacing.lg, gap: theme.spacing.md },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md,
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: theme.spacing.md,
  },
  iconBox: { width: 44, height: 44, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '700', color: theme.colors.textPrimary },
  rowSubtitle: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
});
