import React, { useState, useMemo, useEffect } from 'react';
import { FlatList, RefreshControl, View, StyleSheet, TextInput, ScrollView, Text } from 'react-native';
// LinearGradient removed — solid-color pills work reliably on native
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Screen } from '../common/Screen';
import { SoftPress } from '../common/SoftPress';
import { AppHeader } from '../common/AppHeader';
import { ProfileIconButton } from '../common/ProfileIconButton';
import { EmptyState } from '../common/EmptyState';
import { LoadingOverlay } from '../common/LoadingOverlay';
import { TicketCard } from './TicketCard';
import { getTickets } from '../../lib/api/tickets';
import { exportTicketsToSpreadsheet } from '../../lib/utils/export';
import { useAuthStore } from '../../stores/authStore';
import { QUERY_KEYS } from '../../constants/queryKeys';
import { ALL_PRIORITIES } from '../../constants/ticket';
import { TicketPriority } from '../../types';
import { theme, webNoOutline } from '../../constants/theme';
import { NumericText } from '../common/NumericText';

interface Props {
  title: string;
  filters: Parameters<typeof getTickets>[0];
  showCreateButton?: boolean;
  /** Enables the search box + status/priority filter chips (admin registry). */
  enableFilters?: boolean;
}

const STATUSES = ['open', 'in_progress', 'resolved'] as const;

export function TicketListScreen({ title, filters, enableFilters }: Props) {
  const { t } = useTranslation();
  const profile = useAuthStore((s) => s.profile);
  // A home stat tile can deep-link here pre-filtered, e.g. ?status=open or ?sla=1.
  const params = useLocalSearchParams<{ status?: string; sla?: string }>();
  const { data: tickets, isLoading, refetch, isRefetching } = useQuery({
    queryKey: QUERY_KEYS.tickets(filters),
    queryFn: () => getTickets(filters),
  });

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | (typeof STATUSES)[number]>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | TicketPriority>('all');
  const slaOnly = params.sla === '1';

  // Apply an incoming ?status= param to the status filter (drives the chip when
  // shown; otherwise still filters the list client-side).
  useEffect(() => {
    if (params.status && (STATUSES as readonly string[]).includes(params.status)) {
      setStatusFilter(params.status as (typeof STATUSES)[number]);
    }
  }, [params.status]);

  const filteredTickets = useMemo(() => {
    let list = tickets ?? [];
    if (slaOnly) list = list.filter((tk) => tk.sla_breached);
    if (statusFilter !== 'all') list = list.filter((t) => t.status === statusFilter);
    if (priorityFilter !== 'all') list = list.filter((t) => t.priority === priorityFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((t) =>
        [
          t.sampark_display_id,
          t.ticket_number,
          t.description,
          t.category,
          t.priority,
          t.status,
          t.requester?.display_name,
          t.assignee?.display_name,
          t.sampark_technician_name,
          t.store?.name,
        ]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(q)),
      );
    }
    return list;
  }, [tickets, search, statusFilter, priorityFilter, slaOnly]);

  // Status pill label: "in_progress" reads as "Active" in the mockup.
  const statusLabel = (s: (typeof STATUSES)[number]) => (s === 'in_progress' ? 'Active' : t(`status.${s}`));

  const renderTopFilters = () => (
    <View style={styles.filterWrap}>
      <View style={styles.searchBox}>
        <Ionicons name="search" size={16} color={theme.colors.textTertiary} />
        <TextInput
          style={[styles.searchInput, webNoOutline]}
          value={search}
          onChangeText={setSearch}
          placeholder="Search tickets…"
          placeholderTextColor={theme.colors.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={theme.colors.textTertiary} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        <StatusPill label={t('common.all')} active={statusFilter === 'all'} onPress={() => setStatusFilter('all')} />
        {STATUSES.map((s) => (
          <StatusPill key={s} label={statusLabel(s)} active={statusFilter === s} onPress={() => setStatusFilter(s)} />
        ))}
      </ScrollView>

      <View style={styles.countRow}>
        <Text style={styles.count}>
          {filteredTickets.length} of {(tickets ?? []).length} tickets
        </Text>
        <TouchableOpacity
          style={styles.exportBtn}
          onPress={() => exportTicketsToSpreadsheet(filteredTickets).catch(() => null)}
          disabled={filteredTickets.length === 0}
        >
          <Ionicons name="download-outline" size={13} color={theme.colors.brand} />
          <Text style={styles.exportText}>Export</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const priorityRail = (
    <View style={styles.rail}>
      <Text style={styles.railHeader}>PRIORITY</Text>
      <RailBtn label="all" color={theme.colors.brand} active={priorityFilter === 'all'} onPress={() => setPriorityFilter('all')} />
      {ALL_PRIORITIES.map((p) => (
        <RailBtn key={p} label={p} color={theme.priorityColors[p]} active={priorityFilter === p} onPress={() => setPriorityFilter(p)} />
      ))}
    </View>
  );

  const list = (
    <FlatList
      data={filteredTickets}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <TicketCard ticket={item} />}
      contentContainerStyle={styles.list}
      keyboardShouldPersistTaps="handled"
      style={{ flex: 1 }}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      ListEmptyComponent={
        <EmptyState icon="ticket-outline" title={t('ticketList.empty')} subtitle={t('ticketList.emptySubtitle')} />
      }
    />
  );

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader
        title={title}
        right={profile ? <ProfileIconButton profile={profile} /> : undefined}
      />
      {isLoading ? (
        <LoadingOverlay />
      ) : enableFilters ? (
        <>
          {renderTopFilters()}
          <View style={styles.railRow}>
            {priorityRail}
            {list}
          </View>
        </>
      ) : (
        <>
          <View style={styles.compactFilterBar}>
            {(['all', ...STATUSES] as const).map((s) => {
              const isAll = s === 'all';
              const active = statusFilter === s;
              const label = isAll ? t('common.all') : statusLabel(s);
              return (
                <TouchableOpacity
                  key={s}
                  onPress={() => setStatusFilter(s)}
                  activeOpacity={0.7}
                  style={[styles.compactChip, active && styles.compactChipActive]}
                >
                  <Text style={[styles.compactChipText, active && styles.compactChipTextActive]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {list}
        </>
      )}
    </Screen>
  );
}

function StatusPill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.pill, active && styles.pillActive]}
    >
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

// Vertical priority side-rail button: colored tint + outline when active.
function RailBtn({ label, color, active, onPress }: { label: string; color: string; active: boolean; onPress: () => void }) {
  return (
    <SoftPress
      onPress={onPress}
      style={[styles.railBtn, active ? { backgroundColor: color + '18', borderColor: color } : { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
    >
      <Text style={[styles.railBtnText, { color: active ? color : theme.colors.textSecondary }]}>{label}</Text>
    </SoftPress>
  );
}

const styles = StyleSheet.create({
  list: { paddingVertical: theme.spacing.sm, flexGrow: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  filterWrap: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.xs, gap: theme.spacing.sm },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: 12, paddingHorizontal: theme.spacing.md, height: 42, ...theme.shadows.xs,
  },
  searchInput: { flex: 1, color: theme.colors.textPrimary, fontSize: 13, paddingVertical: 0 },
  chipRow: { gap: 6, paddingRight: theme.spacing.lg },
  compactFilterBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.sm,
  },
  compactChip: {
    paddingHorizontal: 14, height: 32, justifyContent: 'center' as const,
    borderRadius: 16, borderWidth: 1,
    borderColor: theme.colors.border, backgroundColor: theme.colors.surface,
  },
  compactChipActive: {
    backgroundColor: theme.colors.brand, borderColor: theme.colors.brand,
  },
  compactChipText: { fontSize: 12, fontWeight: '700', color: theme.colors.textSecondary },
  compactChipTextActive: { color: '#fff' },
  pill: {
    borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface,
    borderRadius: 16, paddingHorizontal: 14, height: 32, justifyContent: 'center' as const,
  },
  pillActive: {
    backgroundColor: theme.colors.brand, borderColor: theme.colors.brand,
  },
  pillText: { fontSize: 12, fontWeight: '700', color: theme.colors.textSecondary },
  pillTextActive: { color: '#fff' },
  railRow: { flex: 1, flexDirection: 'row' },
  rail: { width: 66, paddingLeft: theme.spacing.lg, paddingRight: theme.spacing.sm, paddingTop: theme.spacing.xs, gap: 6 },
  railHeader: { fontSize: 8, fontWeight: '800', color: theme.colors.textTertiary, letterSpacing: 1, marginBottom: 2, marginLeft: 2 },
  railBtn: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 7 },
  railBtnText: { fontSize: 9, fontWeight: '700', textTransform: 'capitalize' },
  countRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 2 },
  count: { fontSize: 11, color: theme.colors.textTertiary, fontWeight: '600' },
  exportBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: theme.colors.brand + '14', borderWidth: 1, borderColor: theme.colors.brand + '33',
    borderRadius: theme.radius.full, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.xs,
  },
  exportText: { fontSize: 11, fontWeight: '800', color: theme.colors.brand },
});
