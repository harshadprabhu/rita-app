import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Screen } from '../common/Screen';
import { AppHeader } from '../common/AppHeader';
import { ProfileIconButton } from '../common/ProfileIconButton';
import { GoldRateCard } from './GoldRateCard';
import { getTickets } from '../../lib/api/tickets';
import { useAuthStore } from '../../stores/authStore';
import { QUERY_KEYS } from '../../constants/queryKeys';
import { theme } from '../../constants/theme';

interface StatDef {
  label: string;
  filters: Parameters<typeof getTickets>[0];
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
}

interface Props {
  stats: StatDef[];
  showCreateButton?: boolean;
  /** Store-facing roles (user/manager) see the gold rate card; admin doesn't. */
  showGoldRate?: boolean;
}

export function HomeDashboard({ stats, showCreateButton, showGoldRate }: Props) {
  const { t } = useTranslation();
  const profile = useAuthStore((s) => s.profile);

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader title="RITA" right={profile ? <ProfileIconButton profile={profile} /> : null} />
      <ScrollView contentContainerStyle={styles.body}>
        {profile && (
          <>
            <Text style={styles.greeting}>{t('home.greeting', { name: profile.display_name.split(' ')[0] })}</Text>
            <Text style={styles.greetingSubtitle}>Here's what's happening today</Text>
          </>
        )}

        {showGoldRate && <GoldRateCard />}

        <View style={styles.statsGrid}>
          {stats.map((stat) => (
            <StatCard key={stat.label} {...stat} />
          ))}
        </View>

        {showCreateButton && (
          <TouchableOpacity style={[styles.createBtn, theme.shadows.brand]} onPress={() => router.push('/create-ticket')} activeOpacity={0.85}>
            <Ionicons name="add-circle-outline" size={22} color="#fff" />
            <Text style={styles.createBtnText}>Report an issue</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </Screen>
  );
}

function StatCard({ label, filters, color, icon }: StatDef) {
  const { data } = useQuery({ queryKey: QUERY_KEYS.tickets(filters), queryFn: () => getTickets(filters) });
  return (
    <View style={[styles.statCard, theme.shadows.xs]}>
      <View style={[styles.statIconRing, { backgroundColor: color + '1F' }]}>
        <Ionicons name={icon} size={17} color={color} />
      </View>
      <Text style={styles.statValue}>{data?.length ?? '–'}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: theme.spacing.lg },
  greeting: { fontSize: 22, fontWeight: '800', color: theme.colors.textPrimary, letterSpacing: 0.2 },
  greetingSubtitle: { fontSize: 13, color: theme.colors.textTertiary, marginTop: 2, marginBottom: theme.spacing.lg, fontWeight: '500' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md },
  statCard: {
    flexBasis: '47%', backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg,
    borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing.md + 2, gap: 6,
  },
  statIconRing: {
    width: 34, height: 34, borderRadius: theme.radius.md,
    alignItems: 'center', justifyContent: 'center', marginBottom: 2,
  },
  statValue: { fontSize: 24, fontWeight: '800', color: theme.colors.textPrimary, letterSpacing: 0.2 },
  statLabel: { fontSize: 12, color: theme.colors.textSecondary, fontWeight: '600' },
  createBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.sm,
    backgroundColor: theme.colors.brand, borderRadius: theme.radius.lg, height: 54, marginTop: theme.spacing.xl,
  },
  createBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
