import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ProfileScreen } from '../../components/common/ProfileScreen';
import { theme } from '../../constants/theme';

export default function ManagerProfile() {
  const { t } = useTranslation();
  return (
    <View style={{ flex: 1 }}>
      <ProfileScreen />
      <View style={styles.linksRow}>
        <TouchableOpacity style={styles.link} onPress={() => router.push('/(manager)/announcements')}>
          <Ionicons name="megaphone-outline" size={18} color={theme.colors.brand} />
          <Text style={styles.linkText}>{t('announcements.title')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  linksRow: { position: 'absolute', bottom: theme.spacing.xl, left: theme.spacing.lg, right: theme.spacing.lg, flexDirection: 'row', gap: theme.spacing.md },
  link: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface2, borderRadius: theme.radius.md, paddingVertical: theme.spacing.md,
  },
  linkText: { color: theme.colors.brand, fontWeight: '700', fontSize: 13 },
});
