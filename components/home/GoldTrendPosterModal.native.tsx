import React, { useRef, useState } from 'react';
import {
  Modal, View, Image, Text, TouchableOpacity, StyleSheet, Dimensions, ActivityIndicator, ScrollView, Linking,
} from 'react-native';
import Svg, { Polyline, Polygon } from 'react-native-svg';
import QRCode from 'react-native-qrcode-svg';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
// NOTE: only *types* may be imported from './GoldTrendPosterModal' — on native
// that path resolves to this very file, so a runtime import would be circular
// and come back undefined. Shared values live in constants/links.
import type { GoldTrendPosterModalProps, TrendSeries } from './GoldTrendPosterModal';
import { IGP_URL } from '../../constants/links';
import type { GoldRateTrendPoint } from '../../lib/api/goldRate';
import { theme } from '../../constants/theme';

const RUPEE = String.fromCharCode(0x20B9);
const GOLD = theme.colors.accent;
const GOLD2 = theme.colors.accentBright;
const UP = '#34D399';
const DOWN = '#F87171';

function fmt(n: number): string {
  return Math.round(n).toLocaleString('en-IN');
}

function changeOf(points: GoldRateTrendPoint[]): number | null {
  if (points.length < 2 || !(points[0].rate > 0)) return null;
  return ((points[points.length - 1].rate - points[0].rate) / points[0].rate) * 100;
}

/** Compact filled sparkline sized to the poster column. */
function Spark({ points, color, height = 56 }: { points: GoldRateTrendPoint[]; color: string; height?: number }) {
  const W = 300;
  const H = height;
  const PAD = 4;
  if (points.length < 2) return null;
  const rates = points.map((p) => p.rate);
  const min = Math.min(...rates);
  const max = Math.max(...rates);
  const span = max - min || 1;
  const x = (i: number) => PAD + ((W - 2 * PAD) * i) / (points.length - 1);
  const y = (r: number) => PAD + (H - 2 * PAD) * (1 - (r - min) / span);
  const line = points.map((p, i) => `${x(i)},${y(p.rate)}`).join(' ');
  const area = `${PAD},${H - PAD} ${line} ${W - PAD},${H - PAD}`;
  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
      <Polygon points={area} fill={color} fillOpacity={0.16} />
      <Polyline points={line} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}

function TrendBlock({ s }: { s: TrendSeries }) {
  const change = changeOf(s.points);
  const up = (change ?? 0) >= 0;
  const color = change === null ? GOLD : up ? UP : DOWN;
  const first = s.points[0]?.rate;
  const last = s.points[s.points.length - 1]?.rate;
  return (
    <View style={styles.block}>
      <View style={styles.blockHead}>
        <Text style={styles.blockLabel}>{s.label}</Text>
        {change !== null && (
          <View style={[styles.chgPill, { backgroundColor: color + '22', borderColor: color + '55' }]}>
            <Text style={[styles.chgText, { color }]}>{up ? '▲' : '▼'} {Math.abs(change).toFixed(2)}%</Text>
          </View>
        )}
      </View>
      {s.points.length >= 2 ? (
        <>
          <Spark points={s.points} color={color} />
          <View style={styles.blockFoot}>
            <Text style={styles.blockFootText}>{RUPEE}{fmt(first)}</Text>
            <Text style={[styles.blockFootText, { color: '#fff', fontWeight: '800' }]}>{RUPEE}{fmt(last)}</Text>
          </View>
        </>
      ) : (
        <Text style={styles.blockEmpty}>Not enough data yet</Text>
      )}
    </View>
  );
}

export function GoldTrendPosterModal({ visible, onClose, series, currentRate, date }: GoldTrendPosterModalProps) {
  const shotRef = useRef<React.ComponentRef<typeof ViewShot>>(null);
  const [sharing, setSharing] = useState(false);
  const W = Math.min(Dimensions.get('window').width - 40, 360);

  const share = async () => {
    setSharing(true);
    try {
      const uri = await captureRef(shotRef, { format: 'png', quality: 1 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Gold Rate Trends' });
      }
    } catch {
      // user cancelled / capture failed
    } finally {
      setSharing(false);
    }
  };

  const dateStr = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <ViewShot ref={shotRef} style={{ width: W }}>
            <LinearGradient
              colors={theme.gradients.goldCard}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={[styles.poster, { width: W }]}
            >
              {/* gold hairline */}
              <LinearGradient
                colors={['transparent', GOLD, GOLD2, 'transparent'] as const}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.hairline}
              />

              {/* Brand header */}
              <View style={styles.header}>
                <Image source={require('../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.brand}>Indriya Jewellery</Text>
                  <Text style={styles.eyebrow}>GOLD RATE TRENDS · 24 KT (999)</Text>
                </View>
              </View>

              {/* Headline rate */}
              {currentRate ? (
                <View style={styles.headline}>
                  <Text style={styles.headlineLabel}>TODAY'S RATE / GRAM</Text>
                  <Text style={styles.headlineValue}>{RUPEE}{fmt(currentRate)}</Text>
                  <Text style={styles.headlineDate}>{dateStr}</Text>
                </View>
              ) : null}

              {/* Trend blocks: 1 Week, 3 Months, 1 Year */}
              {series.map((s) => <TrendBlock key={s.label} s={s} />)}

              {/* Scheme enrolment CTA — tappable here, and printed as a button
                  in the captured poster image. */}
              <TouchableOpacity
                style={styles.ctaWrap}
                onPress={() => Linking.openURL(IGP_URL).catch(() => null)}
                activeOpacity={0.85}
              >
                <Text style={styles.ctaKicker}>START YOUR GOLD SAVINGS JOURNEY</Text>
                <View style={styles.ctaRow}>
                  {/* QR makes the *shared image* actionable — a PNG can't carry
                      a hyperlink, so recipients scan this instead. */}
                  <View style={styles.qrBox}>
                    <QRCode value={IGP_URL} size={52} color="#0F1B38" backgroundColor="#FFFFFF" />
                  </View>
                  <View style={styles.ctaCol}>
                    <LinearGradient
                      colors={theme.gradients.gold}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                      style={styles.ctaBtn}
                    >
                      <Ionicons name="sparkles" size={12} color={theme.colors.textPrimary} />
                      <Text style={styles.ctaBtnText}>Enrol for Schemes</Text>
                      <Ionicons name="arrow-forward" size={12} color={theme.colors.textPrimary} />
                    </LinearGradient>
                    <Text style={styles.ctaUrl}>{IGP_URL.replace(/^https?:\/\//, '').replace(/\/$/, '')}</Text>
                    <Text style={styles.ctaScan}>Scan the code to enrol</Text>
                  </View>
                </View>
              </TouchableOpacity>
            </LinearGradient>
          </ViewShot>

          <View style={styles.actions}>
            <TouchableOpacity style={[styles.btn, styles.shareBtn]} onPress={share} disabled={sharing} activeOpacity={0.85}>
              {sharing ? <ActivityIndicator color={theme.colors.textPrimary} /> : (
                <>
                  <Ionicons name="share-social-outline" size={18} color={theme.colors.textPrimary} />
                  <Text style={styles.shareText}>Share / Save</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.btn} onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)' },
  scroll: { alignItems: 'center', paddingVertical: theme.spacing.xl, paddingHorizontal: theme.spacing.lg },
  poster: { borderRadius: 18, overflow: 'hidden', paddingBottom: 14 },
  hairline: { height: 1, width: '100%' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 12 },
  logo: { width: 34, height: 34 },
  brand: { color: '#fff', fontSize: 15, fontWeight: '600', fontFamily: theme.fonts.serif },
  eyebrow: { color: GOLD, fontSize: 7, fontWeight: '800', letterSpacing: 1.2, marginTop: 2 },
  headline: { alignItems: 'center', paddingTop: 12, paddingBottom: 8 },
  headlineLabel: { color: 'rgba(255,255,255,0.35)', fontSize: 7.5, fontWeight: '800', letterSpacing: 1.4 },
  headlineValue: { color: GOLD2, fontSize: 34, fontWeight: '800', letterSpacing: -0.5, marginTop: 2 },
  headlineDate: { color: 'rgba(255,255,255,0.4)', fontSize: 9, marginTop: 2 },
  block: {
    marginHorizontal: 14, marginTop: 8, borderRadius: 12, paddingHorizontal: 10, paddingTop: 8, paddingBottom: 6,
    backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
  },
  blockHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  blockLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  chgPill: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, borderWidth: 1 },
  chgText: { fontSize: 8.5, fontWeight: '800' },
  blockFoot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  blockFootText: { color: 'rgba(255,255,255,0.4)', fontSize: 8.5, fontWeight: '600' },
  blockEmpty: { color: 'rgba(255,255,255,0.35)', fontSize: 10, textAlign: 'center', paddingVertical: 14 },
  ctaWrap: {
    marginHorizontal: 14, marginTop: 12, borderRadius: 14, paddingVertical: 11, paddingHorizontal: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(200,150,62,0.10)', borderWidth: 1, borderColor: 'rgba(200,150,62,0.3)',
  },
  ctaKicker: { color: 'rgba(255,255,255,0.5)', fontSize: 7.5, fontWeight: '800', letterSpacing: 1.1 },
  ctaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, alignSelf: 'stretch' },
  qrBox: { backgroundColor: '#fff', padding: 4, borderRadius: 7 },
  ctaCol: { flex: 1, alignItems: 'center' },
  ctaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 9, paddingHorizontal: 14, borderRadius: 999, alignSelf: 'stretch',
    shadowColor: GOLD, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.5, shadowRadius: 8, elevation: 5,
  },
  ctaBtnText: { color: theme.colors.textPrimary, fontSize: 12.5, fontWeight: '800', letterSpacing: 0.2 },
  ctaUrl: { color: GOLD2, fontSize: 10, fontWeight: '700', marginTop: 5 },
  ctaScan: { color: 'rgba(255,255,255,0.4)', fontSize: 7.5, fontWeight: '600', marginTop: 2 },
  actions: { flexDirection: 'row', gap: theme.spacing.md, marginTop: theme.spacing.lg, alignItems: 'center' },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.xl, borderRadius: theme.radius.full },
  shareBtn: { backgroundColor: GOLD },
  shareText: { color: theme.colors.textPrimary, fontSize: 15, fontWeight: '800' },
  closeText: { color: 'rgba(255,255,255,0.8)', fontSize: 15, fontWeight: '600' },
});
