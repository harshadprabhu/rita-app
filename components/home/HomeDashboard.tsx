import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Screen } from '../common/Screen';
import { AppHeader } from '../common/AppHeader';
import { IndriyaWordmark } from '../common/IndriyaWordmark';
import { ProfileIconButton } from '../common/ProfileIconButton';
import { GoldRateCard } from './GoldRateCard';
import { getTicketCount } from '../../lib/api/tickets';
import { useAuthStore } from '../../stores/authStore';
import { SoftPress } from '../common/SoftPress';
import { QUERY_KEYS } from '../../constants/queryKeys';
import { NumericText } from '../common/NumericText';
import { theme } from '../../constants/theme';
import { breadcrumb } from '../../lib/utils/crashLogger';

breadcrumb('module: HomeDashboard.tsx loaded');

interface StatDef {
  label: string;
  filters: Parameters<typeof getTicketCount>[0];
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Where tapping the tile navigates (a filtered ticket list). */
  href?: Parameters<typeof router.push>[0];
}

interface QuickAction {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
  onPress: () => void;
}

interface Props {
  stats: StatDef[];
  showCreateButton?: boolean;
  /** Store-facing roles (user/manager) see the gold rate card; admin doesn't. */
  showGoldRate?: boolean;
  /** Manager-only shortcuts (Broadcasts, Promotions) shown as a row below the gold rate card. */
  quickActions?: QuickAction[];
}

export function HomeDashboard({ stats, showGoldRate, quickActions }: Props) {
  breadcrumb('HomeDashboard render');
  const { t } = useTranslation();
  const profile = useAuthStore((s) => s.profile);

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader
        title="Indriya"
        titleNode={<IndriyaWordmark color="#fff" width={104} />}
        subtitle="RITA · POS Triage"
        right={profile ? <ProfileIconButton profile={profile} /> : null}
      />
      <ScrollView contentContainerStyle={styles.body}>
        {/* Greeting — the gold "+" FAB (in the tab bar) is the report action. */}
        {profile && (
          <View style={styles.topRow}>
            <Text style={styles.greeting}>{t('home.greeting', { name: profile.display_name.split(' ')[0] })}</Text>
            <Text style={styles.greetingSubtitle}>Here's what's happening today</Text>
          </View>
        )}

        {showGoldRate && <GoldRateCard />}

        {quickActions && quickActions.length > 0 && (
          <View style={styles.quickActionsRow}>
            {quickActions.map((qa) => (
              <SoftPress key={qa.label} style={[styles.quickActionBtn, theme.shadows.xs]} onPress={qa.onPress}>
                <View style={[styles.quickActionIcon, { backgroundColor: qa.bg }]}>
                  <Ionicons name={qa.icon} size={17} color={qa.color} />
                </View>
                <Text style={styles.quickActionLabel} numberOfLines={1}>{qa.label}</Text>
              </SoftPress>
            ))}
          </View>
        )}

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
  // Count-only — was pulling every ticket's full row plus requester/assignee/
  // store/attachments joins on every Home visit just to read `.length`.
  const { data } = useQuery({ queryKey: QUERY_KEYS.ticketCount(filters), queryFn: () => getTicketCount(filters) });
  const inner = (
    <>
      <View style={[styles.statIconRing, { backgroundColor: color + '1F' }]}>
        <Ionicons name={icon} size={15} color={color} />
      </View>
      <View style={styles.statText}>
        <NumericText style={styles.statValue}>{data ?? '–'}</NumericText>
        <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
      </View>
    </>
  );
  if (!href) return <View style={[styles.statCard, theme.shadows.xs]}>{inner}</View>;
  return (
    <SoftPress style={[styles.statCard, theme.shadows.xs]} onPress={() => router.push(href)}>
      {inner}
    </SoftPress>
  );
}

const styles = StyleSheet.create({
  body: { padding: theme.spacing.lg },
  topRow: { marginBottom: theme.spacing.lg },
  greeting: { fontSize: 26, fontFamily: 'BegumSans-Medium', color: theme.colors.textPrimary, letterSpacing: 0.2 },
  greetingSubtitle: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 3, fontWeight: '500' },
  quickActionsRow: { flexDirection: 'row', gap: theme.spacing.sm, marginBottom: theme.spacing.md },
  quickActionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg,
    borderWidth: 1, borderColor: theme.colors.border, paddingVertical: 13, paddingHorizontal: theme.spacing.md,
  },
  quickActionIcon: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  quickActionLabel: { fontSize: 12.5, fontWeight: '700', color: theme.colors.textPrimary, flexShrink: 1 },
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
});
