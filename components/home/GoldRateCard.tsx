import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  LayoutAnimation, Platform, UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useGoldRate, useGoldRateTrend } from '../../hooks/useGoldRate';
import { timeAgo } from '../../lib/utils/date';
import { downloadGoldRatePoster, ratesFromGold, isPosterSupported } from '../../lib/utils/goldPoster';
import { theme } from '../../constants/theme';
import { GoldRateTrendChart } from './GoldRateTrendChart';

// LayoutAnimation needs an explicit opt-in on Android for the expand/collapse to animate.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Indian Rupee sign (U+20B9) constructed at runtime to keep source file ASCII-only
// Raw Unicode chars in JSX text nodes can confuse Metro/Hermes on some Android builds
const RUPEE = String.fromCharCode(0x20B9);

// Purities to display in the card, in order, mapped from the D365 API purity string
const DISPLAY_PURITIES = [
  { purity: '24KT 999', label: '24 KT (999)' },
  { purity: '24KT 995', label: '24 KT (995)' },
  { purity: '22KT',     label: '22 KT (916)' },
  { purity: '18KT',     label: '18 KT (750)' },
] as const;

interface RateTileProps {
  karat: string;
  rate: number;
}

function RateTile({ karat, rate }: RateTileProps) {
  return (
    <View style={styles.rateTile}>
      <Text style={styles.karatLabel}>{karat}</Text>
      <Text style={styles.rateValue}>
        {RUPEE}{rate.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </Text>
    </View>
  );
}

export function GoldRateCard() {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const { data, isLoading, refetch, isRefetching } = useGoldRate();
  // Only fetch the trend once the card is expanded — keeps the collapsed view cheap.
  const { data: trend } = useGoldRateTrend(expanded);

  // Build the list of columns that actually have a rate value
  const columns = data
    ? DISPLAY_PURITIES.flatMap((item) => {
        const rate = data.rates[item.purity];
        return rate !== undefined ? [{ ...item, rate }] : [];
      })
    : [];

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((e) => !e);
  };

  return (
    <View style={[styles.card, theme.shadows.md]}>
      {/* Header — tapping anywhere here toggles expand/collapse */}
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={toggle}
        style={styles.header}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
      >
        <View style={styles.headerLeft}>
          <View style={styles.goldIconWrap}>
            <Ionicons name="trending-up" size={18} color={theme.colors.accent} />
          </View>
          <Text style={styles.cardTitle}>{t('goldRate.title')}</Text>
        </View>
        <View style={styles.headerRight}>
          {isPosterSupported() && data && (
            <TouchableOpacity
              onPress={() => {
                const posterRates = ratesFromGold(data.rates);
                if (posterRates) downloadGoldRatePoster(posterRates, new Date(data.updated_at));
              }}
              style={styles.refreshBtn}
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              accessibilityLabel="Download gold rate poster"
            >
              <Ionicons name="download-outline" size={18} color={theme.colors.accent} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => refetch()}
            disabled={isRefetching}
            style={styles.refreshBtn}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          >
            {isRefetching ? (
              <ActivityIndicator size="small" color={theme.colors.accent} />
            ) : (
              <Ionicons name="refresh-outline" size={18} color={theme.colors.accent} />
            )}
          </TouchableOpacity>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={20}
            color="rgba(255,255,255,0.6)"
          />
        </View>
      </TouchableOpacity>

      {/* Content */}
      {isLoading ? (
        <ActivityIndicator color={theme.colors.accent} style={{ marginVertical: theme.spacing.xl }} />
      ) : columns.length > 0 ? (
        /* All rates always visible; chevron expands the 7-day trend chart. */
        <>
          <View style={styles.ratesGrid}>
            {columns.map((col) => (
              <RateTile key={col.purity} karat={col.label} rate={col.rate} />
            ))}
          </View>
          {expanded && <GoldRateTrendChart points={trend ?? []} />}
          <View style={styles.footer}>
            <Ionicons name="time-outline" size={12} color="rgba(255,255,255,0.35)" />
            <Text style={styles.updatedText}>
              {t('goldRate.updated', { time: timeAgo(data!.updated_at) })}
            </Text>
          </View>
        </>
      ) : (
        <View style={styles.noRateWrap}>
          <Ionicons name="information-circle-outline" size={20} color={theme.colors.accent} />
          <Text style={styles.noRateText}>
            {t('goldRate.unavailable')}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.brand,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.lg,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  headlineRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  headlineLabel: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  headlineValue: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  goldIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(201,168,76,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 14,
    fontWeight: '600',
  },
  refreshBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  rateTile: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: theme.radius.sm,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  karatLabel: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  rateValue: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingTop: theme.spacing.md,
  },
  updatedText: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 11,
    fontWeight: '500',
  },
  noRateWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
  },
  noRateText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    flex: 1,
  },
});
