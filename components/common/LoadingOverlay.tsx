import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { Text } from 'react-native-paper';
import { theme } from '../../constants/theme';

interface Props {
  message?: string;
}

/**
 * Branded loading screen: the gold Indriya gazelle gently "steps" (a bobbing +
 * slight sway) over a pulsing ground shadow on the brand navy — an original,
 * lightweight motion (no external animation asset needed).
 */
export function LoadingOverlay({ message }: Props) {
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
      {message && <Text style={styles.text}>{message}</Text>}
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
  text: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    fontWeight: '600',
  },
});
