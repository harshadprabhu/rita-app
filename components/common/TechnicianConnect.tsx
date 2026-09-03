import React, { useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from './Screen';
import { AppHeader } from './AppHeader';
import { ProfileIconButton } from './ProfileIconButton';
import { EmptyState } from './EmptyState';
import { LoadingOverlay } from './LoadingOverlay';
import { getTechnicians } from '../../lib/api/profiles';
import { getUnreadDmCounts } from '../../lib/api/directMessages';
import { useOnlineTechnicians } from '../../hooks/useTechnicianPresence';
import { useAuthStore } from '../../stores/authStore';
import { DbProfile } from '../../types';
import { theme } from '../../constants/theme';

// "Connect with IT" — lists technicians (the Sampark roster, synced into
// RITA profiles) with live availability from RITA presence. Available
// technicians (green) sort to the top; offline ones (grey) fall to the
// bottom. Tap to open a direct message.
export function TechnicianConnect() {
  const me = useAuthStore((s) => s.profile);
  const online = useOnlineTechnicians();

  const { data: technicians, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['technicians', 'connect'],
    queryFn: getTechnicians,
  });
  const { data: unread } = useQuery({
    queryKey: ['dm-unread', me?.id],
    queryFn: () => getUnreadDmCounts(me!.id),
    enabled: !!me?.id,
    refetchInterval: 15000,
  });

  const sorted = useMemo(() => {
    const list = (technicians ?? []).filter((t) => t.id !== me?.id);
    return [...list].sort((a, b) => {
      const ao = online.has(a.id) ? 0 : 1;
      const bo = online.has(b.id) ? 0 : 1;
      if (ao !== bo) return ao - bo;              // available first
      return (a.display_name ?? '').localeCompare(b.display_name ?? '');
    });
  }, [technicians, online, me?.id]);

  const availableCount = sorted.filter((t) => online.has(t.id)).length;

  const renderItem = ({ item }: { item: DbProfile }) => {
    const isOnline = online.has(item.id);
    const unreadCount = unread?.[item.id] ?? 0;
    return (
      <TouchableOpacity
        style={[styles.card, !isOnline && styles.cardOffline]}
        activeOpacity={0.75}
        onPress={() => router.push(`/dm/${item.id}` as never)}
      >
        <View style={styles.avatarWrap}>
          <View style={[styles.avatar, { backgroundColor: isOnline ? theme.colors.brand : '#9CA3AF' }]}>
            <Text style={styles.avatarText}>{(item.display_name ?? '?').slice(0, 2).toUpperCase()}</Text>
          </View>
          <View style={[styles.presenceDot, { backgroundColor: isOnline ? '#22C55E' : '#9CA3AF' }]} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>{item.display_name}</Text>
          <Text style={[styles.status, { color: isOnline ? '#16A34A' : theme.colors.textTertiary }]}>
            {isOnline ? 'Available now' : 'Offline'}
            {item.designation ? ` · ${item.designation}` : ''}
          </Text>
        </View>
        {unreadCount > 0 && (
          <View style={styles.badge}><Text style={styles.badgeText}>{unreadCount}</Text></View>
        )}
        <Ionicons name="chatbubble-ellipses-outline" size={20} color={isOnline ? theme.colors.brand : theme.colors.textTertiary} />
      </TouchableOpacity>
    );
  };

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader title="Connect with IT" right={me ? <ProfileIconButton profile={me} /> : undefined} />
      {isLoading ? (
        <LoadingOverlay />
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(t) => t.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <Text style={styles.summary}>
              {availableCount > 0 ? `${availableCount} technician${availableCount > 1 ? 's' : ''} available now` : 'No technicians online right now — leave a message and they’ll see it.'}
            </Text>
          }
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
          ListEmptyComponent={<EmptyState icon="people-outline" title="No technicians" subtitle="No approved technicians to connect with yet." />}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: theme.spacing.md, gap: theme.spacing.sm, flexGrow: 1 },
  summary: { fontSize: 13, color: theme.colors.textSecondary, fontWeight: '600', marginBottom: theme.spacing.sm, paddingHorizontal: 4 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md,
    backgroundColor: theme.colors.surface, borderRadius: 14, padding: theme.spacing.md,
    borderWidth: 1, borderColor: theme.colors.border, ...theme.shadows.xs,
  },
  cardOffline: { opacity: 0.72 },
  avatarWrap: { position: 'relative' },
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  presenceDot: { position: 'absolute', right: -1, bottom: -1, width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: theme.colors.surface },
  name: { fontSize: 15, fontWeight: '700', color: theme.colors.textPrimary },
  status: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  badge: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: theme.colors.error, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
});
