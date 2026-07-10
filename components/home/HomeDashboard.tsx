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
  /** Where tapping the tile navigates (a filtered ticket list). */
  href?: Parameters<typeof router.push>[0];
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
      <AppHeader
        title="Indriya Jewellery"
        subtitle="RITA · POS Triage"
        right={profile ? <ProfileIconButton profile={profile} /> : null}
      />
      <ScrollView contentContainerStyle={styles.body}>
        {/* Greeting row — minimal "Report an issue" action sits at the top-right. */}
        <View style={styles.topRow}>
          <View style={{ flex: 1 }}>
            {profile && (
              <>
                <Text style={styles.greeting}>{t('home.greeting', { name: profile.display_name.split(' ')[0] })}</Text>
                <Text style={styles.greetingSubtitle}>Here's what's happening today</Text>
              </>
            )}
          </View>
          {showCreateButton && (
            <TouchableOpacity style={styles.createBtn} onPress={() => router.push('/create-ticket')} activeOpacity={0.85}>
              <Ionicons name="add" size={16} color={theme.colors.textPrimary} />
              <Text style={styles.createBtnText}>Report</Text>
            </TouchableOpacity>
          )}
        </View>

        {showGoldRate && <GoldRateCard />}

        <View style={styles.statsGrid}>
          {stats.map((stat) => (
            <StatCard key={stat.label} {...stat} />
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

function StatCard({ label, filters, color, icon, href }: StatDef) {
  const { data } = useQuery({ queryKey: QUERY_KEYS.tickets(filters), queryFn: () => getTickets(filters) });
  const inner = (
    <>
      <View style={[styles.statIconRing, { backgroundColor: color + '1F' }]}>
        <Ionicons name={icon} size={15} color={color} />
      </View>
      <View style={styles.statText}>
        <Text style={styles.statValue}>{data?.length ?? '–'}</Text>
        <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
      </View>
    </>
  );
  if (!href) return <View style={[styles.statCard, theme.shadows.xs]}>{inner}</View>;
  return (
    <TouchableOpacity style={[styles.statCard, theme.shadows.xs]} onPress={() => router.push(href)} activeOpacity={0.7}>
      {inner}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  body: { padding: theme.spacing.lg },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm, marginBottom: theme.spacing.lg },
  greeting: { fontSize: 26, fontWeight: '600', color: theme.colors.textPrimary, letterSpacing: 0.2, fontFamily: theme.fonts.serif },
  greetingSubtitle: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 3, fontWeight: '500' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  statCard: {
    flexBasis: '47%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg,
    borderWidth: 1, borderColor: theme.colors.border, paddingVertical: 13, paddingHorizontal: theme.spacing.md,
  },
  statIconRing: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  statText: { flex: 1 },
  statValue: { fontSize: 22, fontWeight: '800', color: theme.colors.textPrimary, letterSpacing: 0.2 },
  statLabel: { fontSize: 10.5, color: theme.colors.textSecondary, fontWeight: '600', marginTop: 1 },
  createBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: theme.colors.accent, borderRadius: theme.radius.full,
    paddingVertical: theme.spacing.sm, paddingHorizontal: theme.spacing.md,
  },
  createBtnText: { color: theme.colors.textPrimary, fontSize: 13, fontWeight: '800' },
});
