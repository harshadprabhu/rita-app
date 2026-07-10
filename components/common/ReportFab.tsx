import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { theme } from '../../constants/theme';

/**
 * Floating gold "+" action from the Figma design — sits centered above the tab
 * bar and opens the report/new-ticket flow. Rendered as a sibling overlay of
 * <Tabs> in the role layouts that can create tickets.
 */
export function ReportFab() {
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <TouchableOpacity activeOpacity={0.88} onPress={() => router.push('/create-ticket')} style={styles.btnShadow}>
        <LinearGradient
          colors={theme.gradients.gold}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={styles.btn}
        >
          <Ionicons name="add" size={26} color={theme.colors.textPrimary} />
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 42, alignItems: 'center', zIndex: 30 },
  btnShadow: {
    borderRadius: 30,
    shadowColor: theme.colors.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 10,
  },
  btn: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: theme.colors.bg,
  },
});
