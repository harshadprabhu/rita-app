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
    // Absolute full-screen, not flex: AuthGate renders this as a sibling of the
    // screen stack, so if a screen ALSO shows a loader they'd stack vertically
    // (two gazelles). Absolute-fill makes any second loader land exactly on top
    // of the first, so only one gazelle is ever visible.
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    // The gazelle in the GIF is navy — needs a light ground to be visible.
    backgroundColor: theme.colors.bg, // cream #EDE8DC
    zIndex: 100,
  },
  gif: { width: 180, height: 180 },
});
