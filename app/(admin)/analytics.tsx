import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Screen } from '../../components/common/Screen';
import { AppHeader } from '../../components/common/AppHeader';
import { LoadingOverlay } from '../../components/common/LoadingOverlay';
import { getTickets } from '../../lib/api/tickets';
import { QUERY_KEYS } from '../../constants/queryKeys';
import { theme } from '../../constants/theme';
import { NumericText } from '../../components/common/NumericText';
import { formatDurationSeconds } from '../../lib/utils/date';

export default function Analytics() {
  const { data: tickets, isLoading } = useQuery({ queryKey: QUERY_KEYS.tickets({}), queryFn: () => getTickets({}) });

  // Top categories by ticket count (native-safe, no chart library).
  const categoryData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tickets ?? []) {
      const key = t.category ?? 'Uncategorized';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [tickets]);

  const total = tickets?.length ?? 0;
  const resolvedCount = (tickets ?? []).filter((t) => t.status === 'resolved').length;
  const inProgress = (tickets ?? []).filter((t) => t.status === 'in_progress').length;
  const openCount = (tickets ?? []).filter((t) => t.status === 'open').length;
  const resolutionRate = total ? Math.round((resolvedCount / total) * 100) : 0;
  const maxCat = categoryData[0]?.value ?? 1;

  // Average resolution time overall + grouped by category and by technician.
  // Only counts tickets with both a resolved_at stamp and a valid duration.
  const resolvedTickets = useMemo(
    () => (tickets ?? []).filter((t) => t.status === 'resolved' && t.resolved_at),
    [tickets],
  );

  const avgResolutionSeconds = useMemo(() => {
    if (resolvedTickets.length === 0) return null;
    const total = resolvedTickets.reduce((sum, t) => {
      const dt = (new Date(t.resolved_at as string).getTime() - new Date(t.created_at).getTime()) / 1000;
      return sum + Math.max(0, dt);
    }, 0);
    return Math.floor(total / resolvedTickets.length);
  }, [resolvedTickets]);

  // Group by resolver: prefer RITA's assignee.display_name; fall back to the
  // Sampark-side technician name for tickets that resolved before an assignee
  // was set locally.
  const byTechnician = useMemo(() => {
    const buckets = new Map<string, number[]>();
    for (const t of resolvedTickets) {
      const name = t.assignee?.display_name ?? t.sampark_technician_name ?? 'Unassigned';
      const dt = (new Date(t.resolved_at as string).getTime() - new Date(t.created_at).getTime()) / 1000;
      const arr = buckets.get(name) ?? [];
      arr.push(Math.max(0, dt));
      buckets.set(name, arr);
    }
    return [...buckets.entries()]
      .map(([label, arr]) => ({ label, count: arr.length, avg: Math.floor(arr.reduce((a, b) => a + b, 0) / arr.length) }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 10);
  }, [resolvedTickets]);

  const byCategoryTime = useMemo(() => {
    const buckets = new Map<string, number[]>();
    for (const t of resolvedTickets) {
      const label = t.category ?? 'Uncategorized';
      const dt = (new Date(t.resolved_at as string).getTime() - new Date(t.created_at).getTime()) / 1000;
      const arr = buckets.get(label) ?? [];
      arr.push(Math.max(0, dt));
      buckets.set(label, arr);
    }
    return [...buckets.entries()]
      .map(([label, arr]) => ({ label, count: arr.length, avg: Math.floor(arr.reduce((a, b) => a + b, 0) / arr.length) }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 10);
  }, [resolvedTickets]);

  const maxCatTime = byCategoryTime[0]?.avg ?? 1;
  const maxTechTime = byTechnician[0]?.avg ?? 1;

  if (isLoading) return <LoadingOverlay />;

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader title="Analytics" showBack />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.statsRow}>
          <Stat label="Total" value={String(total)} />
          <Stat label="Resolved" value={`${resolutionRate}%`} />
        </View>
        <View style={styles.statsRow}>
          <Stat label="Open" value={String(openCount)} color="#3B82F6" />
          <Stat label="In Progress" value={String(inProgress)} color="#F59E0B" />
          <Stat label="Resolved" value={String(resolvedCount)} color="#10B981" />
        </View>
        <View style={styles.statsRow}>
          <Stat
            label="Avg resolution time"
            value={avgResolutionSeconds != null ? formatDurationSeconds(avgResolutionSeconds) : '—'}
            color={theme.colors.accentBright}
          />
        </View>

        <Text style={styles.sectionTitle}>Tickets by category</Text>
        {categoryData.length > 0 ? (
          <View style={styles.chart}>
            {categoryData.map((c) => (
              <View key={c.label} style={styles.barRow}>
                <Text style={styles.barLabel} numberOfLines={1}>{c.label}</Text>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${Math.max(4, (c.value / maxCat) * 100)}%` }]} />
                </View>
                <NumericText style={styles.barValue}>{c.value}</NumericText>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.empty}>No data yet</Text>
        )}

        <Text style={styles.sectionTitle}>Avg resolution time by category</Text>
        {byCategoryTime.length > 0 ? (
          <View style={styles.chart}>
            {byCategoryTime.map((c) => (
              <View key={c.label} style={styles.barRow}>
                <Text style={styles.barLabel} numberOfLines={1}>{c.label}</Text>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${Math.max(4, (c.avg / maxCatTime) * 100)}%`, backgroundColor: theme.colors.accentBright }]} />
                </View>
                <Text style={styles.barValueText} numberOfLines={1}>{formatDurationSeconds(c.avg)}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.empty}>No resolved tickets yet</Text>
        )}

        <Text style={styles.sectionTitle}>Avg resolution time by technician</Text>
        {byTechnician.length > 0 ? (
          <View style={styles.chart}>
            {byTechnician.map((t) => (
              <View key={t.label} style={styles.barRow}>
                <Text style={styles.barLabel} numberOfLines={1}>{t.label}</Text>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${Math.max(4, (t.avg / maxTechTime) * 100)}%`, backgroundColor: '#10B981' }]} />
                </View>
                <Text style={styles.barValueText} numberOfLines={1}>{formatDurationSeconds(t.avg)}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.empty}>No resolved tickets yet</Text>
        )}
      </ScrollView>
    </Screen>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={[styles.statCard, theme.shadows.sm]}>
      <NumericText style={[styles.statValue, color ? { color } : null]}>{value}</NumericText>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: theme.spacing.lg },
  statsRow: { flexDirection: 'row', gap: theme.spacing.md, marginBottom: theme.spacing.md },
  statCard: { flex: 1, backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: theme.spacing.md, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.border },
  statValue: { fontSize: 22, fontWeight: '800', color: theme.colors.textPrimary },
  statLabel: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 4 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: theme.colors.textPrimary, marginTop: theme.spacing.lg, marginBottom: theme.spacing.md },
  chart: { gap: theme.spacing.sm },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  barLabel: { width: 96, fontSize: 12, color: theme.colors.textSecondary },
  barTrack: { flex: 1, height: 18, backgroundColor: theme.colors.surface2, borderRadius: theme.radius.sm, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: theme.colors.brand, borderRadius: theme.radius.sm },
  barValue: { width: 28, textAlign: 'right', fontSize: 12, fontWeight: '700', color: theme.colors.textPrimary },
  barValueText: { minWidth: 60, textAlign: 'right', fontSize: 11, fontWeight: '700', color: theme.colors.textPrimary },
  empty: { color: theme.colors.textTertiary, fontSize: 13 },
});
