import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ProfileScreen } from '../../components/common/ProfileScreen';
import { theme } from '../../constants/theme';

export default function AdminProfile() {
  return (
    <View style={{ flex: 1 }}>
      <ProfileScreen />
      <View style={styles.linksRow}>
        <AdminLink icon="people-outline" label="Accounts" onPress={() => router.push('/(admin)/accounts')} />
        <AdminLink icon="bar-chart-outline" label="Analytics" onPress={() => router.push('/(admin)/analytics')} />
      </View>
    </View>
  );
}

function AdminLink({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.link} onPress={onPress}>
      <Ionicons name={icon} size={18} color={theme.colors.brand} />
      <Text style={styles.linkText}>{label}</Text>
    </TouchableOpacity>
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
