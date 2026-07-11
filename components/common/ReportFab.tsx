import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, usePathname } from 'expo-router';
import { theme } from '../../constants/theme';

/**
 * Floating gold "+" action from the Figma design — sits centered above the tab
 * bar and opens the report/new-ticket flow. Rendered as a sibling overlay of
 * <Tabs> in the role layouts that can create tickets.
 */
export function ReportFab() {
  const pathname = usePathname();
  // The profile screen hides the tab bar, so hide the FAB there too.
  if (pathname?.includes('/profile')) return null;
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <TouchableOpacity activeOpacity={0.88} onPress={() => router.push('/create-ticket')} style={styles.btnShadow}>
        <LinearGradient
          colors={theme.gradients.gold}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={styles.btn}
        >
          <Ionicons name="add" size={32} color={theme.colors.textPrimary} />
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 44, alignItems: 'center', zIndex: 30 },
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
