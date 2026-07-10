import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  LayoutAnimation, Platform, UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
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
const RUPEE = String.fromCharCode(0x20B9);
const GOLD = theme.colors.accent;

// Purities to display in the card, in order, mapped from the D365 API purity string
const DISPLAY_PURITIES = [
  { purity: '24KT 999', label: '24 KT · 999' },
  { purity: '24KT 995', label: '24 KT · 995' },
  { purity: '22KT',     label: '22 KT · 916' },
  { purity: '18KT',     label: '18 KT · 750' },
] as const;

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

  // Delta % over the collected trend window (first → last), if we have enough points.
  const delta =
    trend && trend.length >= 2 && trend[0].rate > 0
      ? (((trend[trend.length - 1].rate - trend[0].rate) / trend[0].rate) * 100)
      : null;

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((e) => !e);
  };

  return (
    <LinearGradient
      colors={theme.gradients.goldCard}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={[styles.card, theme.shadows.md]}
    >
      {/* gold hairline along the very top edge */}
      <LinearGradient
        colors={['transparent', GOLD, theme.colors.accentBright, 'transparent'] as const}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={styles.hairline}
      />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.goldIconWrap}>
            <Ionicons name="trending-up" size={13} color={GOLD} />
          </View>
          <View>
            <Text style={styles.cardTitle}>{t('goldRate.title')}</Text>
            <Text style={styles.cardEyebrow}>PER GRAM · INR</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          {delta !== null && (
            <View style={styles.deltaPill}>
              <Text style={styles.deltaText}>
                {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(2)}%
              </Text>
            </View>
          )}
          <TouchableOpacity onPress={() => refetch()} disabled={isRefetching} hitSlop={8}>
            {isRefetching
              ? <ActivityIndicator size="small" color="rgba(255,255,255,0.5)" />
              : <Ionicons name="refresh-outline" size={13} color="rgba(255,255,255,0.4)" />}
          </TouchableOpacity>
          <TouchableOpacity onPress={toggle} hitSlop={8}>
            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={13} color="rgba(255,255,255,0.4)" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Content */}
      {isLoading ? (
        <ActivityIndicator color={GOLD} style={{ marginVertical: theme.spacing.xl }} />
      ) : columns.length > 0 ? (
        <>
          {/* 2×2 rate grid */}
          <View style={styles.grid}>
            {columns.map((col, i) => (
              <View
                key={col.purity}
                style={[styles.gridCell, { backgroundColor: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.038)' }]}
              >
                <Text style={styles.karatLabel}>{col.label}</Text>
                <Text style={styles.rateValue}>
                  {RUPEE}{col.rate.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </View>
            ))}
          </View>

          {/* Trend (expand to view) */}
          {expanded && (
            <View style={styles.trendWrap}>
              <Text style={styles.trendLabel}>24 KT · 7-DAY TREND</Text>
              {trend && trend.length >= 2 ? (
                <GoldRateTrendChart points={trend} />
              ) : (
                <Text style={styles.trendEmpty}>{t('goldRate.noTrend')}</Text>
              )}
            </View>
          )}

          {/* Footer: updated + poster */}
          <View style={styles.footer}>
            <Text style={styles.updatedText}>
              {t('goldRate.updated', { time: timeAgo(data!.updated_at) })}
            </Text>
            {isPosterSupported() && (
              <TouchableOpacity style={styles.posterBtn} onPress={handleDownload} activeOpacity={0.85}>
                <LinearGradient
                  colors={theme.gradients.gold}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={styles.posterBtnInner}
                >
                  <Ionicons name="download-outline" size={11} color={theme.colors.textPrimary} />
                  <Text style={styles.posterBtnText}>{t('goldRate.downloadPoster')}</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
          </View>
        </>
      ) : (
        <View style={styles.noRateWrap}>
          <Ionicons name="information-circle-outline" size={20} color={GOLD} />
          <Text style={styles.noRateText}>{t('goldRate.unavailable')}</Text>
        </View>
      )}

      {/* Native poster (no-op on web) */}
      <GoldRatePosterModal
        visible={posterRates !== null}
        onClose={() => setPosterRates(null)}
        rates={posterRates}
        date={data ? new Date(data.updated_at) : new Date()}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
  },
  hairline: { height: 1, width: '100%' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  goldIconWrap: {
    width: 28, height: 28, borderRadius: 9,
    backgroundColor: 'rgba(200,150,62,0.10)', borderWidth: 1, borderColor: 'rgba(200,150,62,0.30)',
    alignItems: 'center', justifyContent: 'center',
  },
  cardTitle: { color: '#fff', fontSize: 14, fontWeight: '600', fontFamily: theme.fonts.serif },
  cardEyebrow: { color: 'rgba(255,255,255,0.32)', fontSize: 7.5, fontWeight: '700', letterSpacing: 1.4, marginTop: 2 },
  deltaPill: {
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: theme.radius.full,
    backgroundColor: 'rgba(16,185,129,0.12)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.2)',
  },
  deltaText: { color: '#6EE7B7', fontSize: 9, fontWeight: '800' },
  grid: {
    flexDirection: 'row', flexWrap: 'wrap',
    marginHorizontal: 14, borderRadius: 12, overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  gridCell: { width: '50%', paddingHorizontal: 10, paddingVertical: 9 },
  karatLabel: { color: GOLD, fontSize: 7.5, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
  rateValue: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
  trendWrap: {
    marginHorizontal: 14, marginTop: 10, borderRadius: 12,
    paddingHorizontal: 10, paddingTop: 8, paddingBottom: 6,
    backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
  },
  trendLabel: { color: 'rgba(255,255,255,0.22)', fontSize: 7.5, fontWeight: '700', letterSpacing: 1.2, marginBottom: 6 },
  trendEmpty: { color: 'rgba(255,255,255,0.5)', fontSize: 12, textAlign: 'center', paddingVertical: theme.spacing.md },
  footer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, marginTop: 10,
  },
  updatedText: { color: 'rgba(255,255,255,0.24)', fontSize: 8, fontWeight: '500' },
  posterBtn: { borderRadius: 9, overflow: 'hidden' },
  posterBtnInner: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6 },
  posterBtnText: { color: theme.colors.textPrimary, fontSize: 10, fontWeight: '800' },
  noRateWrap: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, paddingHorizontal: 14, paddingVertical: theme.spacing.md },
  noRateText: { color: 'rgba(255,255,255,0.55)', fontSize: 13, flex: 1 },
});
