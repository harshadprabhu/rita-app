import React, { useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from './Screen';
import { AppHeader } from './AppHeader';
import { ProfileIconButton } from './ProfileIconButton';
import { EmptyState } from './EmptyState';
import { LoadingOverlay } from './LoadingOverlay';
import { getTechnicians } from '../../lib/api/profiles';
import { getUnreadDmCounts } from '../../lib/api/directMessages';
import { getSamparkConnectTechnicians } from '../../lib/api/samparkTechnicians';
import { useOnlineTechnicians } from '../../hooks/useTechnicianPresence';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { theme } from '../../constants/theme';

// A normalized Connect row, whichever source it came from.
interface Row { id: string; name: string; online: boolean }

// "Connect with IT" — lists technicians LICENSED IN SAMPARK (matched to a RITA
// account by email so they're chattable), with availability from Sampark's own
// signal. Until that roster is synced (Zoho users scope pending), it falls back
// to RITA technician profiles with RITA-presence / recent-Sampark-activity.
// Available technicians sort to the top; tap to open a direct message.
export function TechnicianConnect() {
  const me = useAuthStore((s) => s.profile);
  const online = useOnlineTechnicians();
  const qc = useQueryClient();

  // Primary source: the synced Sampark roster (empty until the scope lands).
  const { data: samparkTechs } = useQuery({
    queryKey: ['sampark-connect-techs'],
    queryFn: getSamparkConnectTechnicians,
    refetchInterval: 30000,
  });

  // Fallback source: RITA technician profiles.
  const { data: ritaTechs, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['technicians', 'connect'],
    queryFn: getTechnicians,
    refetchInterval: 30000,
  });

  const { data: unread } = useQuery({
    queryKey: ['dm-unread', me?.id],
    queryFn: () => getUnreadDmCounts(me!.id),
    enabled: !!me?.id,
    refetchInterval: 15000,
  });

  // Realtime: when the sync writes the roster/availability, refresh instantly.
  useEffect(() => {
    const ch = supabase
      .channel(`sampark-techs:${Math.random().toString(36).slice(2, 7)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sampark_technicians' },
        () => qc.invalidateQueries({ queryKey: ['sampark-connect-techs'] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const SAMPARK_ACTIVE_MS = 10 * 60 * 1000;
  const rows = useMemo<Row[]>(() => {
    const usingSampark = (samparkTechs?.length ?? 0) > 0;
    let list: Row[];
    if (usingSampark) {
      // Availability = Sampark's own signal, OR live RITA presence as a bonus.
      list = samparkTechs!.map((t) => ({ id: t.ritaProfileId, name: t.name, online: t.online || online.has(t.ritaProfileId) }));
    } else {
      // Fallback: RITA presence OR recent Sampark activity.
      list = (ritaTechs ?? []).map((p) => ({
        id: p.id,
        name: p.display_name,
        online: online.has(p.id) || (!!p.last_sampark_active_at && Date.now() - new Date(p.last_sampark_active_at).getTime() < SAMPARK_ACTIVE_MS),
      }));
    }
    return list
      .filter((r) => r.id !== me?.id)
      .sort((a, b) => (a.online === b.online ? a.name.localeCompare(b.name) : a.online ? -1 : 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [samparkTechs, ritaTechs, online, me?.id]);

  const availableCount = rows.filter((r) => r.online).length;

  const renderItem = ({ item }: { item: Row }) => {
    const unreadCount = unread?.[item.id] ?? 0;
    return (
      <TouchableOpacity
        style={[styles.card, !item.online && styles.cardOffline]}
        activeOpacity={0.75}
        onPress={() => router.push(`/dm/${item.id}` as never)}
      >
        <View style={styles.avatarWrap}>
          <View style={[styles.avatar, { backgroundColor: item.online ? theme.colors.brand : '#9CA3AF' }]}>
            <Text style={styles.avatarText}>{(item.name ?? '?').slice(0, 2).toUpperCase()}</Text>
          </View>
          <View style={[styles.presenceDot, { backgroundColor: item.online ? '#22C55E' : '#9CA3AF' }]} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
          <Text style={[styles.status, { color: item.online ? '#16A34A' : theme.colors.textTertiary }]}>
            {item.online ? 'Available now' : 'Offline'}
          </Text>
        </View>

        {/* Chat — in-app RITA direct message (not Sampark). */}
        <View style={styles.actionBtn}>
          <Ionicons name="chatbubble-ellipses" size={18} color={theme.colors.brand} />
          {unreadCount > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{unreadCount}</Text></View>}
        </View>
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
          data={rows}
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
  actionBtn: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: theme.colors.surface2, borderWidth: 1, borderColor: theme.colors.border,
  },
  badge: { position: 'absolute', top: -3, right: -3, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: theme.colors.error, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
});
