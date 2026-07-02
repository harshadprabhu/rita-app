import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { BarChart } from 'react-native-gifted-charts';
import { Screen } from '../../components/common/Screen';
import { AppHeader } from '../../components/common/AppHeader';
import { LoadingOverlay } from '../../components/common/LoadingOverlay';
import { getTickets } from '../../lib/api/tickets';
import { QUERY_KEYS } from '../../constants/queryKeys';
import { theme } from '../../constants/theme';

export default function Analytics() {
  const { data: tickets, isLoading } = useQuery({ queryKey: QUERY_KEYS.tickets({}), queryFn: () => getTickets({}) });

  const categoryData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tickets ?? []) {
      const key = t.category ?? 'uncategorized';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([label, value]) => ({
      label: label.replace(/_/g, ' ').slice(0, 10),
      value,
      frontColor: theme.colors.brand,
    }));
  }, [tickets]);

  const resolvedCount = (tickets ?? []).filter((t) => t.status === 'resolved').length;
  const total = tickets?.length ?? 0;
  const resolutionRate = total ? Math.round((resolvedCount / total) * 100) : 0;

  if (isLoading) return <LoadingOverlay />;

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader title="Analytics" showBack />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.statsRow}>
          <Stat label="Total Tickets" value={String(total)} />
          <Stat label="Resolution Rate" value={`${resolutionRate}%`} />
        </View>

        <Text style={styles.sectionTitle}>Tickets by Category</Text>
        {categoryData.length > 0 ? (
          <BarChart
            data={categoryData}
            barWidth={28}
            spacing={20}
            roundedTop
            xAxisLabelTextStyle={{ fontSize: 9, color: theme.colors.textSecondary }}
            yAxisTextStyle={{ fontSize: 10, color: theme.colors.textSecondary }}
          />
        ) : (
          <Text style={styles.empty}>No data yet</Text>
        )}
      </ScrollView>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={[styles.statCard, theme.shadows.sm]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: theme.spacing.lg },
  statsRow: { flexDirection: 'row', gap: theme.spacing.md, marginBottom: theme.spacing.xl },
  statCard: { flex: 1, backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: theme.spacing.lg, alignItems: 'center' },
  statValue: { fontSize: 24, fontWeight: '700', color: theme.colors.textPrimary },
  statLabel: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 4 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: theme.colors.textPrimary, marginBottom: theme.spacing.md },
  empty: { color: theme.colors.textTertiary, fontSize: 13 },
});
