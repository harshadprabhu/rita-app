import React, { useRef } from 'react';
import { Animated, Pressable, PressableProps, ViewStyle, StyleProp, GestureResponderEvent } from 'react-native';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface Props extends Omit<PressableProps, 'style'> {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** How far it dips on press (0.96 = subtle, 0.90 = pronounced). */
  scaleTo?: number;
}

/**
 * A pressable with a soft spring "landing": it eases down on press-in and
 * springs back with a gentle bounce on release, instead of the instant opacity
 * flip TouchableOpacity gives. Drop-in replacement for TouchableOpacity — the
 * style and transform sit on the Pressable itself, so flex layouts and
 * backgrounds scale as a whole and nothing shifts.
 */
export function SoftPress({ children, style, scaleTo = 0.94, onPressIn, onPressOut, ...rest }: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  const down = (e: GestureResponderEvent) => {
    Animated.spring(scale, { toValue: scaleTo, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
    onPressIn?.(e);
  };
  const up = (e: GestureResponderEvent) => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 8 }).start();
    onPressOut?.(e);
  };

  return (
    <AnimatedPressable onPressIn={down} onPressOut={up} style={[style, { transform: [{ scale }] }]} {...rest}>
      {children}
    </AnimatedPressable>
  );
}
