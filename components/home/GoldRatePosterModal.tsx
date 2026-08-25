import React, { useRef, useState } from 'react';
import {
  Modal, View, Image, Text, TouchableOpacity, StyleSheet, Dimensions, ActivityIndicator, Platform, Alert,
} from 'react-native';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
// expo-file-system v19 (SDK 54) moved the classic imperative API to the
// /legacy subpath. Importing the bare package makes readAsStringAsync
// undefined at runtime, which silently killed the share button.
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import type { PosterRates } from '../../lib/utils/goldPoster';
import { pngDataUrlToPdfBlob } from '../../lib/utils/goldPoster';
import { theme } from '../../constants/theme';

export interface GoldRatePosterModalProps {
  visible: boolean;
  onClose: () => void;
  rates: PosterRates | null;
  date: Date;
  /** Active Ops Manager promotion, printed as a Special Offer banner. */
  promo?: string | null;
}

// One implementation for both platforms — react-native-view-shot v5 ships a web
// capture (html2canvas), so the poster renders and exports on web too. Template
// is 1054×1491; overlay anchor points are fractions of that.
const AR = 1491 / 1054;
const GOLD = '#f2d98a';
// Widened from the underline's own 268px (right edge only — left stays
// where the underline starts, right after the "Date:" label) so the added
// time fits the open background to the right without crowding the label.
const DATE_LINE = { left: 452 / 1054, top: 668 / 1491, width: 460 / 1054 };
const BOX_LEFT = 561 / 1054;
const BOX_W = 340 / 1054;
const BOX_H = 114 / 1491;
const RATES: { key: keyof PosterRates; top: number }[] = [
  { key: '24k_999', top: 778 / 1491 },
  { key: '24k_995', top: 914 / 1491 },
  { key: '22k_916', top: 1050 / 1491 },
  { key: '18k_750', top: 1186 / 1491 },
];
// Special-offer banner as fractions of the compressed template — rates are
// shifted upward, giving a large clean area for promotions.
const OFFER = { left: 130 / 1054, top: 1254 / 1491, width: 794 / 1054, height: 177 / 1491 };

function ordinal(d: number): string {
  if (d > 3 && d < 21) return 'th';
  return ['th', 'st', 'nd', 'rd'][d % 10] ?? 'th';
}
function formatDate(d: Date): string {
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${d.getDate()}${ordinal(d.getDate())} ${months[d.getMonth()]} ${d.getFullYear()}`;
}
/** e.g. "6:22 PM" — matches the web canvas poster's formatting. */
function formatTime(d: Date): string {
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function GoldRatePosterModal({ visible, onClose, rates, date, promo }: GoldRatePosterModalProps) {
  const shotRef = useRef<React.ComponentRef<typeof ViewShot>>(null);
  const [sharing, setSharing] = useState(false);
  const isWeb = Platform.OS === 'web';

  const W = Math.min(Dimensions.get('window').width - 40, 360);
  const H = W * AR;
  const rateFont = Math.round(W * 0.044);
  // Slightly smaller than the old date-only size (0.029) now that it's
  // sharing the line with a time — keeps the combined string comfortably
  // inside the widened box instead of crowding the "Date:" label.
  const dateFont = Math.round(W * 0.025);

  const share = async () => {
    setSharing(true);
    try {
      const hiResW = 1054 * 2;
      const hiResH = Math.round(hiResW * AR);
      if (isWeb) {
        const dataUrl = await captureRef(shotRef, { format: 'png', quality: 1, result: 'data-uri', width: hiResW, height: hiResH });
        const blob = pngDataUrlToPdfBlob(dataUrl);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = `indriya_gold_rates_${date.toISOString().slice(0, 10)}.pdf`;
        link.href = url;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        return;
      }
      const pngUri = await captureRef(shotRef, { format: 'png', quality: 1, width: hiResW, height: hiResH });
      const b64 = await FileSystem.readAsStringAsync(pngUri, { encoding: 'base64' });
      const html = `<html><body style="margin:0;padding:0"><img src="data:image/png;base64,${b64}" style="width:100%;height:auto" /></body></html>`;
      const { uri: pdfUri } = await Print.printToFileAsync({ html, width: 595, height: 842 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(pdfUri, { mimeType: 'application/pdf', dialogTitle: "Today's Gold Rates" });
      }
    } catch (err) {
      // Never silently swallow — a bare catch is what hid the underlying
      // "readAsStringAsync is undefined" for weeks. Surface the message so
      // the next failure is diagnosable.
      const msg = err instanceof Error ? err.message : String(err);
      if (!/cancel/i.test(msg)) Alert.alert('Could not share poster', msg);
    } finally {
      setSharing(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ViewShot ref={shotRef} style={{ width: W, height: H }}>
          <Image source={require('../../assets/gold-rate-template.png')} style={{ width: W, height: H }} resizeMode="contain" />
          {rates && (
            <>
              <View style={{
                position: 'absolute',
                left: DATE_LINE.left * W,
                top: DATE_LINE.top * H - dateFont * 1.4,
                width: DATE_LINE.width * W,
                height: dateFont * 1.4,
                alignItems: 'center',
                justifyContent: 'flex-end',
              }}>
                <Text style={{ color: GOLD, fontSize: dateFont, fontWeight: '600' }}>{formatDate(date)}  ·  {formatTime(date)}</Text>
              </View>
              {RATES.map((r) => {
                const v = rates[r.key];
                if (!(v > 0)) return null;
                return (
                  <View key={r.key} style={{
                    position: 'absolute',
                    left: BOX_LEFT * W,
                    top: (r.top - BOX_H / 2) * H,
                    width: BOX_W * W,
                    height: BOX_H * H,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <Text style={{ color: GOLD, fontSize: rateFont, fontWeight: '800', textAlign: 'center' }}>
                      {`₹ ${Math.round(v).toLocaleString('en-IN')}/-`}
                    </Text>
                  </View>
                );
              })}
            </>
          )}
          {/* Special-offer text — no background box; golden gradient text
              directly on the dark poster bottom. */}
          {rates && promo?.trim() ? (() => {
            const offerW = OFFER.width * W;
            const offerH = OFFER.height * H;
            const kickerFont = Math.round(W * 0.02);
            const kickerH = kickerFont * 1.6;
            const pad = 4;
            const availH = offerH - kickerH - pad * 2;
            const availW = offerW - 12;
            const text = promo!.trim();
            let bodyFont = Math.round(W * 0.022);
            while (bodyFont > 4) {
              const charsPerLine = Math.max(1, Math.floor(availW / (bodyFont * 0.55)));
              const linesNeeded = Math.ceil(text.length / charsPerLine);
              if (linesNeeded * bodyFont * 1.3 <= availH) break;
              bodyFont--;
            }
            return (
              <View style={{
                position: 'absolute',
                left: OFFER.left * W, top: OFFER.top * H, width: offerW, height: offerH,
                alignItems: 'center', paddingHorizontal: 6, paddingVertical: pad,
              }}>
                <Text style={[styles.offerKicker, { fontSize: kickerFont }]}>{"✦  T O D A Y ' S   O F F E R  ✦"}</Text>
                <View style={{ flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={[styles.offerText, { fontSize: bodyFont, lineHeight: bodyFont * 1.3 }]}>{text}</Text>
                </View>
              </View>
            );
          })() : null}
        </ViewShot>

        <View style={styles.actions}>
          <TouchableOpacity style={[styles.btn, styles.shareBtn]} onPress={share} disabled={sharing} activeOpacity={0.85}>
            {sharing ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name={isWeb ? 'download-outline' : 'share-social-outline'} size={18} color="#fff" />
                <Text style={styles.shareText}>{isWeb ? 'Download' : 'Share / Save'}</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.btn} onPress={onClose} activeOpacity={0.7}>
            <Text style={styles.closeText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', padding: theme.spacing.lg },
  anchor: { position: 'absolute', alignItems: 'center' },
  offerKicker: { color: '#F2D98A', fontWeight: '800', letterSpacing: 0.5 },
  offerText: { color: '#E0B55A', fontWeight: '800', textAlign: 'center' },
  actions: { flexDirection: 'row', gap: theme.spacing.md, marginTop: theme.spacing.xl, alignItems: 'center' },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.xl, borderRadius: theme.radius.full },
  shareBtn: { backgroundColor: theme.colors.accent },
  shareText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  closeText: { color: 'rgba(255,255,255,0.8)', fontSize: 15, fontWeight: '600' },
});
