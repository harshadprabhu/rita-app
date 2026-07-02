import React from 'react';
import { Appbar } from 'react-native-paper';
import { router } from 'expo-router';
import { theme } from '../../constants/theme';

interface Props {
  title: string;
  showBack?: boolean;
  right?: React.ReactNode;
}

export function AppHeader({ title, showBack = false, right }: Props) {
  return (
    <Appbar.Header
      style={[{ backgroundColor: theme.colors.brand, height: 58 }, theme.shadows.sm]}
      statusBarHeight={0}
    >
      {showBack && <Appbar.BackAction onPress={() => router.back()} color="#fff" />}
      <Appbar.Content title={title} titleStyle={{ color: '#fff', fontWeight: '700', fontSize: 18, letterSpacing: 0.2 }} />
      {right}
    </Appbar.Header>
  );
}
