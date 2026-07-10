import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { MetalNavy } from './MetalNavy';
import { theme } from '../../constants/theme';

interface Props {
  title: string;
  /** Small uppercase eyebrow under the title (e.g. "RITA · POS Triage"). */
  subtitle?: string;
  showBack?: boolean;
  right?: React.ReactNode;
}

export function AppHeader({ title, subtitle, showBack = false, right }: Props) {
  return (
    <MetalNavy edge="bottom" style={[styles.header, theme.shadows.sm]}>
      {showBack && (
        <TouchableOpacity onPress={() => router.back()} style={styles.back} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
      )}
      <View style={styles.titleWrap}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right}
    </MetalNavy>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  back: { padding: 4, marginRight: 2 },
  titleWrap: { flex: 1, justifyContent: 'center' },
  title: {
    color: '#fff',
    fontSize: 19,
    fontWeight: '600',
    fontFamily: theme.fonts.serif,
    letterSpacing: 0.2,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.34)',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginTop: 2,
  },
});
