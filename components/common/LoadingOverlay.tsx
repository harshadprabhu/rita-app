import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { theme } from '../../constants/theme';

interface Props {
  /** Accepted for backwards-compat but no longer shown — the boot screen is a
   *  single, wordless animation so there's never a "Loading…" vs "Starting…"
   *  mismatch across the boot sequence. */
  message?: string;
}

/**
 * The one and only loading screen: the animated Indriya gazelle (assets/
 * loading.gif) centred on the brand navy. No text — every loader in the app
 * shows this identical silent animation, so the native splash flows straight
 * into it as a single continuous screen. expo-image autoplays the GIF on both
 * Android and iOS (RN's core Image doesn't animate GIFs on Android).
 */
export function LoadingOverlay(_props: Props) {
  return (
    <View style={styles.container}>
      <Image
        source={require('../../assets/loading.gif')}
        style={styles.gif}
        contentFit="contain"
        autoplay
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.brand,
  },
  gif: { width: 160, height: 160 },
});
