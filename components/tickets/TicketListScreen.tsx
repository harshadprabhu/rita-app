import React, { useState, useMemo, useEffect } from 'react';
import { FlatList, RefreshControl, View, StyleSheet, TextInput, ScrollView, Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Screen } from '../common/Screen';
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

interface Props {
  title: string;
  filters: Parameters<typeof getTickets>[0];
  showCreateButton?: boolean;
  /** Enables the search box + status/priority filter chips (admin registry). */
  enableFilters?: boolean;
}

const STATUSES = ['open', 'in_progress', 'resolved'] as const;

export function TicketListScreen({ title, filters, showCreateButton, enableFilters }: Props) {
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
          t.ticket_number,
          t.description,
          t.category,
          t.priority,
          t.status,
          t.requester?.display_name,
          t.assignee?.display_name,
          t.store?.name,
        ]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(q)),
      );
    }
    return list;
  }, [tickets, search, statusFilter, priorityFilter, slaOnly]);

  const renderFilters = () => (
    <View style={styles.filterWrap}>
      <View style={styles.searchBox}>
        <Ionicons name="search" size={16} color={theme.colors.textTertiary} />
        <TextInput
          style={[styles.searchInput, webNoOutline]}
          value={search}
          onChangeText={setSearch}
          placeholder="Search tickets, requester, store…"
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
        <Chip label={t('common.all')} active={statusFilter === 'all'} onPress={() => setStatusFilter('all')} />
        {STATUSES.map((s) => (
          <Chip key={s} label={t(`status.${s}`)} active={statusFilter === s} onPress={() => setStatusFilter(s)} />
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        <Chip label={t('common.all')} active={priorityFilter === 'all'} onPress={() => setPriorityFilter('all')} />
        {ALL_PRIORITIES.map((p) => (
          <Chip key={p} label={p} active={priorityFilter === p} onPress={() => setPriorityFilter(p)} capitalize />
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

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader
        title={title}
        right={
          <View style={styles.headerRight}>
            {showCreateButton && (
              <TouchableOpacity onPress={() => router.push('/create-ticket')} style={styles.addBtn}>
                <Ionicons name="add" size={24} color="#fff" />
              </TouchableOpacity>
            )}
            {profile && <ProfileIconButton profile={profile} />}
          </View>
        }
      />
      {isLoading ? (
        <LoadingOverlay />
      ) : (
        <FlatList
          data={enableFilters ? filteredTickets : (tickets ?? [])}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <TicketCard ticket={item} />}
          ListHeaderComponent={enableFilters ? renderFilters() : null}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
          ListEmptyComponent={
            <EmptyState icon="ticket-outline" title={t('ticketList.empty')} subtitle={t('ticketList.emptySubtitle')} />
          }
        />
      )}
    </Screen>
  );
}

function Chip({ label, active, onPress, capitalize }: { label: string; active: boolean; onPress: () => void; capitalize?: boolean }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.chip, active && styles.chipActive]} activeOpacity={0.8}>
      <Text style={[styles.chipText, capitalize && { textTransform: 'capitalize' }, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  list: { paddingVertical: theme.spacing.md, flexGrow: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  addBtn: { marginRight: theme.spacing.md },
  filterWrap: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.sm, gap: theme.spacing.sm },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface2, borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: theme.radius.full, paddingHorizontal: theme.spacing.md, height: 42,
  },
  searchInput: { flex: 1, color: theme.colors.textPrimary, fontSize: 14, paddingVertical: 0 },
  chipRow: { gap: theme.spacing.xs, paddingRight: theme.spacing.lg },
  chip: {
    borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.full, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.xs,
  },
  chipActive: { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand },
  chipText: { fontSize: 12, fontWeight: '700', color: theme.colors.textSecondary },
  chipTextActive: { color: '#fff' },
  countRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 2 },
  count: { fontSize: 11, color: theme.colors.textTertiary, fontWeight: '600' },
  exportBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: theme.colors.brand + '14', borderWidth: 1, borderColor: theme.colors.brand + '33',
    borderRadius: theme.radius.full, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.xs,
  },
  exportText: { fontSize: 11, fontWeight: '800', color: theme.colors.brand },
});
