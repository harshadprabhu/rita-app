import React, { useRef, useState } from 'react';
import {
  Modal, View, Image, Text, TouchableOpacity, StyleSheet, Dimensions, ActivityIndicator,
} from 'react-native';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import type { GoldRatePosterModalProps } from './GoldRatePosterModal';
import { theme } from '../../constants/theme';

// Template is 1054×1492; overlay anchor points as fractions of that (same
// coordinates the web canvas uses in lib/utils/goldPoster.ts).
const AR = 1492 / 1054;
const GOLD = '#f2d98a';
const DATE = { left: 594 / 1054, top: 512 / 1492 };
const RATE_LEFT = 772 / 1054;
const RATES: { key: keyof NonNullable<GoldRatePosterModalProps['rates']>; top: number }[] = [
  { key: '24k_999', top: 639 / 1492 },
  { key: '24k_995', top: 790 / 1492 },
  { key: '22k_916', top: 940 / 1492 },
  { key: '18k_750', top: 1086 / 1492 },
];

function ordinal(d: number): string {
  if (d > 3 && d < 21) return 'th';
  return ['th', 'st', 'nd', 'rd'][d % 10] ?? 'th';
}
function formatDate(d: Date): string {
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${d.getDate()}${ordinal(d.getDate())} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

export function GoldRatePosterModal({ visible, onClose, rates, date }: GoldRatePosterModalProps) {
  const shotRef = useRef<React.ComponentRef<typeof ViewShot>>(null);
  const [sharing, setSharing] = useState(false);

  const W = Math.min(Dimensions.get('window').width - 40, 360);
  const H = W * AR;
  const rateFont = Math.round(W * 0.044);
  const dateFont = Math.round(W * 0.029);
  const box = W * 0.42;

  const share = async () => {
    setSharing(true);
    try {
      const uri = await captureRef(shotRef, { format: 'png', quality: 1 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: "Today's Gold Rates" });
      }
    } catch {
      // user cancelled / capture failed — nothing to do
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
              <View style={[styles.anchor, { left: DATE.left * W - box / 2, top: DATE.top * H - dateFont, width: box }]}>
                <Text style={{ color: GOLD, fontSize: dateFont, fontWeight: '600' }}>{formatDate(date)}</Text>
              </View>
              {RATES.map((r) => {
                const v = rates[r.key];
                if (!(v > 0)) return null;
                return (
                  <View key={r.key} style={[styles.anchor, { left: RATE_LEFT * W - box / 2, top: r.top * H - rateFont, width: box }]}>
                    <Text style={{ color: GOLD, fontSize: rateFont, fontWeight: '800' }}>
                      {Math.round(v).toLocaleString('en-IN')}
                    </Text>
                  </View>
                );
              })}
            </>
          )}
        </ViewShot>

        <View style={styles.actions}>
          <TouchableOpacity style={[styles.btn, styles.shareBtn]} onPress={share} disabled={sharing} activeOpacity={0.85}>
            {sharing ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name="share-social-outline" size={18} color="#fff" />
                <Text style={styles.shareText}>Share / Save</Text>
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
  actions: { flexDirection: 'row', gap: theme.spacing.md, marginTop: theme.spacing.xl, alignItems: 'center' },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.xl, borderRadius: theme.radius.full },
  shareBtn: { backgroundColor: theme.colors.accent },
  shareText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  closeText: { color: 'rgba(255,255,255,0.8)', fontSize: 15, fontWeight: '600' },
});
