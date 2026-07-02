import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Screen } from '../common/Screen';
import { AppHeader } from '../common/AppHeader';
import { ProfileIconButton } from '../common/ProfileIconButton';
import { getTickets } from '../../lib/api/tickets';
import { useAuthStore } from '../../stores/authStore';
import { QUERY_KEYS } from '../../constants/queryKeys';
import { theme } from '../../constants/theme';

interface StatDef {
  label: string;
  filters: Parameters<typeof getTickets>[0];
  color: string;
}

interface Props {
  stats: StatDef[];
  showCreateButton?: boolean;
}

export function HomeDashboard({ stats, showCreateButton }: Props) {
  const { t } = useTranslation();
  const profile = useAuthStore((s) => s.profile);

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader title="RITA" right={profile ? <ProfileIconButton profile={profile} /> : null} />
      <ScrollView contentContainerStyle={styles.body}>
        {profile && (
          <Text style={styles.greeting}>{t('home.greeting', { name: profile.display_name.split(' ')[0] })}</Text>
        )}

        <View style={styles.statsGrid}>
          {stats.map((stat) => (
            <StatCard key={stat.label} {...stat} />
          ))}
        </View>

        {showCreateButton && (
          <TouchableOpacity style={[styles.createBtn, theme.shadows.md]} onPress={() => router.push('/create-ticket')} activeOpacity={0.85}>
            <Ionicons name="add-circle-outline" size={22} color="#fff" />
            <Text style={styles.createBtnText}>Report an issue</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </Screen>
  );
}

function StatCard({ label, filters, color }: StatDef) {
  const { data } = useQuery({ queryKey: QUERY_KEYS.tickets(filters), queryFn: () => getTickets(filters) });
  return (
    <View style={[styles.statCard, theme.shadows.sm]}>
      <View style={[styles.statDot, { backgroundColor: color }]} />
      <Text style={styles.statValue}>{data?.length ?? '–'}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: theme.spacing.lg },
  greeting: { fontSize: 20, fontWeight: '700', color: theme.colors.textPrimary, marginBottom: theme.spacing.lg },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md },
  statCard: {
    flexBasis: '47%', backgroundColor: theme.colors.surface, borderRadius: theme.radius.md,
    padding: theme.spacing.md, gap: 4,
  },
  statDot: { width: 8, height: 8, borderRadius: 4 },
  statValue: { fontSize: 22, fontWeight: '700', color: theme.colors.textPrimary },
  statLabel: { fontSize: 12, color: theme.colors.textSecondary },
  createBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.sm,
    backgroundColor: theme.colors.brand, borderRadius: theme.radius.md, height: 52, marginTop: theme.spacing.xl,
  },
  createBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
