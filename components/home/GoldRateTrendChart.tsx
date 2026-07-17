import React, { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, PanResponder, LayoutChangeEvent } from 'react-native';
import Svg, { Polyline, Polygon, Circle, Line, Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { theme } from '../../constants/theme';
import type { GoldRateTrendPoint } from '../../lib/api/goldRate';

// Chart geometry (viewBox units). The SVG scales to the container width.
const W = 320;
const H = 124;
const PAD_X = 10;
const PAD_TOP = 10;
const PAD_BOTTOM = 18; // room for the two date labels under the plot

// Above this many points, per-point dots become noise — just draw the line.
const DOTS_MAX = 14;

interface Props {
  points: GoldRateTrendPoint[];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'YYYY-MM-DD' → '16 Jul' (no timezone math). */
function shortDate(iso: string): string {
  const d = Number(iso.slice(8, 10));
  const m = MONTHS[Number(iso.slice(5, 7)) - 1] ?? '';
  return `${d} ${m}`;
}
/** 'YYYY-MM-DD' → '16 Jul 2026'. */
function longDate(iso: string): string {
  return `${shortDate(iso)} ${iso.slice(0, 4)}`;
}
function formatRate(rate: number): string {
  return rate.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const RUPEE = String.fromCharCode(0x20B9);

export function GoldRateTrendChart({ points }: Props) {
  const { t } = useTranslation();
  const title = t('goldRate.trendTitle', { purity: '24 KT (999)' });

  // Index the user is scrubbing to; null = show the latest point.
  const [active, setActive] = useState<number | null>(null);
  const widthRef = useRef(0);
  const pointsRef = useRef(points);
  pointsRef.current = points;

  const pan = useMemo(
    () => {
      const pick = (locationX: number) => {
        const cw = widthRef.current;
        const pts = pointsRef.current;
        if (!cw || pts.length < 2) return;
        // container px → viewBox units → fractional position along the plot
        const vx = (locationX / cw) * W;
        const frac = (vx - PAD_X) / (W - PAD_X * 2);
        const idx = Math.round(frac * (pts.length - 1));
        setActive(Math.min(pts.length - 1, Math.max(0, idx)));
      };
      return PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => pick(e.nativeEvent.locationX),
        onPanResponderMove: (e) => pick(e.nativeEvent.locationX),
      });
    },
    [],
  );

  const onLayout = (e: LayoutChangeEvent) => { widthRef.current = e.nativeEvent.layout.width; };

  const geom = useMemo(() => {
    if (points.length === 0) return null;
    const rates = points.map((p) => p.rate);
    const min = Math.min(...rates);
    const max = Math.max(...rates);
    const range = max - min || 1;
    const plotW = W - PAD_X * 2;
    const plotH = H - PAD_TOP - PAD_BOTTOM;
    const baseline = H - PAD_BOTTOM;
    const xFor = (i: number) => (points.length === 1 ? W / 2 : PAD_X + (plotW * i) / (points.length - 1));
    const yFor = (r: number) => PAD_TOP + plotH * (1 - (r - min) / range);
    const coords = points.map((p, i) => ({ x: xFor(i), y: yFor(p.rate) }));
    const line = coords.map((c) => `${c.x},${c.y}`).join(' ');
    const area = `${line} ${coords[coords.length - 1].x},${baseline} ${coords[0].x},${baseline}`;
    return { coords, line, area, baseline };
  }, [points]);

  if (points.length === 0 || !geom) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.noData}>{t('goldRate.noTrend')}</Text>
      </View>
    );
  }

  const first = points[0].rate;
  const last = points[points.length - 1].rate;
  const deltaPct = first !== 0 ? ((last - first) / first) * 100 : 0;
  const up = last >= first;
  const deltaColor = up ? '#7FCF9E' : '#E89B9B';

  // The readout follows the scrubber; with nothing selected it shows the latest.
  const sel = active ?? points.length - 1;
  const selPoint = points[sel];
  const selCoord = geom.coords[sel];
  const showDots = points.length <= DOTS_MAX;

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{title}</Text>
        {points.length > 1 && (
          <View style={styles.deltaPill}>
            <Ionicons name={up ? 'arrow-up-outline' : 'arrow-down-outline'} size={11} color={deltaColor} />
            <Text style={[styles.deltaText, { color: deltaColor }]}>{Math.abs(deltaPct).toFixed(1)}%</Text>
          </View>
        )}
      </View>

      {/* Readout — one value at a time, driven by the scrubber. */}
      <View style={styles.readout}>
        <Text style={styles.readValue}>{RUPEE}{formatRate(selPoint.rate)}</Text>
        <Text style={styles.readDate}>{longDate(selPoint.entry_date)}</Text>
      </View>

      <View onLayout={onLayout} {...pan.panHandlers}>
        <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
          {points.length > 1 && (
            <>
              <Polygon points={geom.area} fill="rgba(201,168,76,0.12)" />
              <Polyline
                points={geom.line}
                fill="none"
                stroke={theme.colors.accent}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </>
          )}

          {/* Dots only when sparse enough to read. */}
          {showDots && geom.coords.map((c, i) => (
            <Circle key={`p${i}`} cx={c.x} cy={c.y} r={2.5} fill={theme.colors.accent} />
          ))}

          {/* Scrubber: vertical crosshair + emphasised point. */}
          <Line
            x1={selCoord.x} y1={PAD_TOP - 4} x2={selCoord.x} y2={geom.baseline}
            stroke="rgba(255,255,255,0.28)" strokeWidth={1} strokeDasharray="3 3"
          />
          <Circle cx={selCoord.x} cy={selCoord.y} r={4} fill="#fff" stroke={theme.colors.accent} strokeWidth={2} />

          {/* Baseline + just the endpoints' dates — no per-point labels. */}
          <Line x1={PAD_X} y1={geom.baseline + 3} x2={W - PAD_X} y2={geom.baseline + 3} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
          <SvgText x={PAD_X} y={H - 5} fontSize={8.5} fill="rgba(255,255,255,0.4)" textAnchor="start">
            {shortDate(points[0].entry_date)}
          </SvgText>
          <SvgText x={W - PAD_X} y={H - 5} fontSize={8.5} fill="rgba(255,255,255,0.4)" textAnchor="end">
            {shortDate(points[points.length - 1].entry_date)}
          </SvgText>
        </Svg>
      </View>

      <Text style={styles.hint}>Drag across the chart to see any day's rate</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
  },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.xs,
  },
  title: { color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: '600' },
  deltaPill: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  deltaText: { fontSize: 11, fontWeight: '700' },
  readout: { paddingHorizontal: theme.spacing.xs, marginTop: 2, marginBottom: 4 },
  readValue: { color: '#F0DCA0', fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  readDate: { color: 'rgba(255,255,255,0.4)', fontSize: 9, fontWeight: '600', marginTop: 1 },
  hint: { color: 'rgba(255,255,255,0.22)', fontSize: 8, textAlign: 'center', marginTop: 2 },
  noData: { color: 'rgba(255,255,255,0.4)', fontSize: 12, paddingHorizontal: theme.spacing.xs, paddingVertical: theme.spacing.md },
});
