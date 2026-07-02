import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Polyline, Polygon, Circle, Line, Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { theme } from '../../constants/theme';
import type { GoldRateTrendPoint } from '../../lib/api/goldRate';

// Chart geometry (viewBox units). The SVG scales to the container width.
const W = 320;
const H = 124;
const PAD_X = 22;
const PAD_TOP = 24; // room for the value label above each point
const PAD_BOTTOM = 24; // room for day-of-month labels under the plot

interface Props {
  points: GoldRateTrendPoint[];
}

function dayOfMonth(isoDate: string): string {
  // entry_date is 'YYYY-MM-DD'; take the day part without timezone math
  return String(Number(isoDate.slice(8, 10)));
}

function formatRate(rate: number): string {
  return rate.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function GoldRateTrendChart({ points }: Props) {
  const { t } = useTranslation();

  const title = t('goldRate.trendTitle', { purity: '24 KT (999)' });

  if (points.length === 0) {
    return (
      <View style={styles.wrap}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>{title}</Text>
        </View>
        <Text style={styles.noData}>{t('goldRate.noTrend')}</Text>
      </View>
    );
  }

  const rates = points.map((p) => p.rate);
  const min = Math.min(...rates);
  const max = Math.max(...rates);
  const range = max - min || 1; // avoid divide-by-zero on a flat line

  const plotW = W - PAD_X * 2;
  const plotH = H - PAD_TOP - PAD_BOTTOM;
  const baseline = H - PAD_BOTTOM;

  // Single point: keep it centred so we don't draw a degenerate line.
  const xFor = (i: number) =>
    points.length === 1 ? W / 2 : PAD_X + (plotW * i) / (points.length - 1);
  const yFor = (rate: number) => PAD_TOP + plotH * (1 - (rate - min) / range);

  const coords = points.map((p, i) => ({ x: xFor(i), y: yFor(p.rate) }));
  const polyPoints = coords.map((c) => `${c.x},${c.y}`).join(' ');
  const areaPoints = `${polyPoints} ${coords[coords.length - 1].x},${baseline} ${coords[0].x},${baseline}`;

  const first = points[0].rate;
  const last = points[points.length - 1].rate;
  const deltaPct = first !== 0 ? ((last - first) / first) * 100 : 0;
  const up = last >= first;
  const deltaColor = up ? '#7FCF9E' : '#E89B9B';

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{title}</Text>
        {points.length > 1 && (
          <View style={styles.deltaPill}>
            <Ionicons
              name={up ? 'arrow-up-outline' : 'arrow-down-outline'}
              size={11}
              color={deltaColor}
            />
            <Text style={[styles.deltaText, { color: deltaColor }]}>
              {Math.abs(deltaPct).toFixed(1)}%
            </Text>
          </View>
        )}
      </View>

      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
        {points.length > 1 && (
          <>
            <Polygon points={areaPoints} fill="rgba(201,168,76,0.12)" />
            <Polyline
              points={polyPoints}
              fill="none"
              stroke={theme.colors.accent}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </>
        )}

        {/* Rate value above each point; the latest is emphasised in gold */}
        {coords.map((c, i) => {
          const isLast = i === coords.length - 1;
          return (
            <SvgText
              key={`v${i}`}
              x={c.x}
              y={c.y - 7}
              fontSize={isLast ? 8.5 : 8}
              fontWeight={isLast ? '700' : '500'}
              fill={isLast ? '#F0DCA0' : 'rgba(255,255,255,0.85)'}
              textAnchor="middle"
            >
              {formatRate(points[i].rate)}
            </SvgText>
          );
        })}

        {/* Data point markers */}
        {coords.map((c, i) => {
          const isLast = i === coords.length - 1;
          return isLast ? (
            <Circle key={`p${i}`} cx={c.x} cy={c.y} r={3.5} fill="#fff" stroke={theme.colors.accent} strokeWidth={2} />
          ) : (
            <Circle key={`p${i}`} cx={c.x} cy={c.y} r={2.5} fill={theme.colors.accent} />
          );
        })}

        {/* baseline + day-of-month labels */}
        <Line x1={PAD_X} y1={baseline + 4} x2={W - PAD_X} y2={baseline + 4} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
        {coords.map((c, i) => (
          <SvgText
            key={`d${i}`}
            x={c.x}
            y={H - 5}
            fontSize={9}
            fill="rgba(255,255,255,0.4)"
            textAnchor="middle"
          >
            {dayOfMonth(points[i].entry_date)}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.xs,
    paddingHorizontal: theme.spacing.xs,
  },
  title: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '600',
  },
  deltaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  deltaText: {
    fontSize: 11,
    fontWeight: '700',
  },
  noData: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: theme.spacing.md,
  },
});
