import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, usePathname } from 'expo-router';
import { SoftPress } from './SoftPress';
import { theme } from '../../constants/theme';
import { useAuthStore } from '../../stores/authStore';

/**
 * Floating gold "+" action from the Figma design — sits centered above the tab
 * bar and opens the report/new-ticket flow. Rendered as a sibling overlay of
 * <Tabs> in the role layouts that can create tickets.
 *
 * Admin sees the FAB at the original y=44 bottom offset. Every other role
 * gets it nudged ~2mm higher (≈8dp) to clear their differently-laid-out tab
 * bars — requested visually, not a computed offset.
 */
export function ReportFab() {
  const pathname = usePathname();
  const role = useAuthStore((s) => s.profile?.role);
  // The profile screen hides the tab bar, so hide the FAB there too.
  if (pathname?.includes('/profile')) return null;
  const bottom = role === 'admin' ? 44 : 52; // +8dp ≈ 2mm at ~160dpi baseline
  return (
    <View style={[styles.wrap, { bottom }]} pointerEvents="box-none">
      <SoftPress scaleTo={0.9} onPress={() => router.push('/create-ticket')} style={styles.btnShadow}>
        <LinearGradient
          colors={theme.gradients.gold}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={styles.btn}
        >
          <Ionicons name="add" size={32} color={theme.colors.textPrimary} />
        </LinearGradient>
      </SoftPress>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 30 },
  btnShadow: {
    borderRadius: 34,
    shadowColor: theme.colors.accent,
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.55,
    shadowRadius: 16,
    elevation: 12,
  },
  btn: {
    width: 66, height: 66, borderRadius: 33,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3.5, borderColor: theme.colors.bg,
  },
});
