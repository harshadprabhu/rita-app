import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  LayoutAnimation, Platform, UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useGoldRate, useGoldRateTrend } from '../../hooks/useGoldRate';
import { timeAgo } from '../../lib/utils/date';
import { downloadGoldRatePoster, ratesFromGold, isPosterSupported, PosterRates } from '../../lib/utils/goldPoster';
import { theme } from '../../constants/theme';
import { GoldRateTrendChart } from './GoldRateTrendChart';
import { GoldRatePosterModal } from './GoldRatePosterModal';

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
  const [posterRates, setPosterRates] = useState<PosterRates | null>(null); // native modal
  const { data, isLoading, refetch, isRefetching } = useGoldRate();
  const { data: trend } = useGoldRateTrend(true);

  const handleDownload = () => {
    if (!data) return;
    const rates = ratesFromGold(data.rates);
    if (!rates) return;
    // Web draws + downloads on a DOM canvas; native shows a shareable poster.
    if (Platform.OS === 'web') downloadGoldRatePoster(rates, new Date(data.updated_at));
    else setPosterRates(rates);
  };

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

          {/* Minimal download link */}
          {isPosterSupported() && (
            <TouchableOpacity style={styles.downloadBtn} onPress={handleDownload} activeOpacity={0.6} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              <Ionicons name="download-outline" size={13} color={theme.colors.accent} />
              <Text style={styles.downloadBtnText}>{t('goldRate.downloadPoster')}</Text>
            </TouchableOpacity>
          )}

          {/* Trend (expand to view); shows a message until enough days are collected */}
          {expanded && (
            trend && trend.length >= 2 ? (
              <GoldRateTrendChart points={trend} />
            ) : (
              <Text style={styles.trendEmpty}>{t('goldRate.noTrend')}</Text>
            )
          )}

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

      {/* Native poster (no-op on web) — the template with rates overlaid, shareable. */}
      <GoldRatePosterModal
        visible={posterRates !== null}
        onClose={() => setPosterRates(null)}
        rates={posterRates}
        date={data ? new Date(data.updated_at) : new Date()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.brand,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
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
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(201,168,76,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    fontWeight: '600',
  },
  refreshBtn: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
  },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    paddingVertical: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
  },
  downloadBtnText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  trendEmpty: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: theme.spacing.md,
  },
  rateTile: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: theme.radius.sm,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    gap: 2,
  },
  karatLabel: {
    color: theme.colors.accent,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  rateValue: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingTop: theme.spacing.sm,
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
