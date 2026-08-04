import React from 'react';
import { Text, TextProps, StyleSheet, Platform } from 'react-native';

const FONT_FAMILY = Platform.OS === 'web' ? 'Inter' : 'InterNumeric';

/**
 * Text rendered in Inter 16px SemiBold — use for numerical values
 * (gold rates, ticket numbers, counts, prices, etc.).
 */
export function NumericText({ style, ...props }: TextProps) {
  return <Text {...props} style={[styles.base, style]} />;
}

const styles = StyleSheet.create({
  base: { fontFamily: FONT_FAMILY, fontSize: 16, fontWeight: '600' },
});
