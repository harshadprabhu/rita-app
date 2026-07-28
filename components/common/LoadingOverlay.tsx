import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { theme } from '../../constants/theme';

interface Props {
  /** Accepted for backwards-compat but no longer shown — the boot screen is a
   *  single, wordless animation so there's never a "Loading…" vs "Starting…"
   *  mismatch across the boot sequence. */
  message?: string;
}

/**
 * The one and only loading screen: the gold Indriya gazelle gently "steps"
 * (a bobbing + slight sway) over a pulsing ground shadow on the brand navy.
 * No text — every loader in the app shows this identical silent animation, so
 * the native splash flows straight into it as a single continuous screen.
 */
export function LoadingOverlay(_props: Props) {
  const step = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(step, { toValue: 1, duration: 640, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(step, { toValue: 0, duration: 640, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [step]);

  const translateY = step.interpolate({ inputRange: [0, 1], outputRange: [6, -10] });
  const translateX = step.interpolate({ inputRange: [0, 0.5, 1], outputRange: [-3, 0, 3] });
  const scale = step.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] });
  // Shadow shrinks + fades as the gazelle lifts, grounding the step.
  const shadowScale = step.interpolate({ inputRange: [0, 1], outputRange: [1, 0.7] });
  const shadowOpacity = step.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.15] });

  return (
    <View style={styles.container}>
      <View style={styles.stage}>
        <Animated.Image
          source={require('../../assets/logo.png')}
          style={[styles.logo, { transform: [{ translateX }, { translateY }, { scale }] }]}
          resizeMode="contain"
        />
        <Animated.View style={[styles.shadow, { opacity: shadowOpacity, transform: [{ scaleX: shadowScale }] }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.brand,
    gap: theme.spacing.xl,
  },
  stage: {
    width: 160,
    height: 170,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  logo: { width: 140, height: 140 },
  shadow: {
    position: 'absolute',
    bottom: 6,
    width: 96,
    height: 14,
    borderRadius: 999,
    backgroundColor: '#000',
  },
});
