import React from 'react';
import { View, StyleSheet, ActivityIndicator, Image } from 'react-native';
import { Text } from 'react-native-paper';
import { theme } from '../../constants/theme';

interface Props {
  message?: string;
}

export function LoadingOverlay({ message }: Props) {
  return (
    <View style={styles.container}>
      {/* Gold Indriya emblem on the brand navy — a branded splash/loading look. */}
      <Image source={require('../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
      <ActivityIndicator size="large" color={theme.colors.accent} />
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
    gap: theme.spacing.lg,
  },
  logo: {
    width: 140,
    height: 140,
    marginBottom: theme.spacing.sm,
  },
  text: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    fontWeight: '600',
  },
});
