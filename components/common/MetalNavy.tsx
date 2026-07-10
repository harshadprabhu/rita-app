import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../../constants/theme';

/**
 * Brushed steel-blue "metallic navy" surface from the Figma design — a diagonal
 * multi-stop navy gradient with a thin specular highlight stripe along the top
 * (and optionally bottom) edge. Used for headers, the status bar strip, and any
 * navy panel.
 */
export function MetalNavy({
  children,
  style,
  edge = 'top',
}: {
  children?: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  edge?: 'top' | 'bottom' | 'both' | 'none';
}) {
  return (
    <LinearGradient
      colors={theme.gradients.navyMetal}
      locations={theme.gradients.navyMetalLocations}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={style}
    >
      {(edge === 'top' || edge === 'both') && <EdgeStripe position="top" />}
      {children}
      {(edge === 'bottom' || edge === 'both') && <EdgeStripe position="bottom" />}
    </LinearGradient>
  );
}

function EdgeStripe({ position }: { position: 'top' | 'bottom' }) {
  return (
    <LinearGradient
      colors={theme.gradients.metalEdge}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={[styles.stripe, position === 'top' ? styles.top : styles.bottom]}
      pointerEvents="none"
    />
  );
}

const styles = StyleSheet.create({
  stripe: { position: 'absolute', left: 0, right: 0, height: 1.5 },
  top: { top: 0 },
  bottom: { bottom: 0 },
});
