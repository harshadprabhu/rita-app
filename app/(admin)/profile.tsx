import React from 'react';
import { router } from 'expo-router';
import { ProfileScreen, ProfileTool } from '../../components/common/ProfileScreen';
import { theme } from '../../constants/theme';

export default function AdminProfile() {
  const tools: ProfileTool[] = [
    { icon: 'people-outline', label: 'Accounts', color: '#6366F1', bg: '#EEF2FF', onPress: () => router.push('/(admin)/accounts') },
    { icon: 'bar-chart-outline', label: 'Analytics', color: '#0EA5E9', bg: '#E0F2FE', onPress: () => router.push('/(admin)/analytics') },
    { icon: 'checkmark-done-outline', label: 'Approvals', color: '#10B981', bg: '#ECFDF5', onPress: () => router.push('/(admin)/approvals') },
    { icon: 'megaphone-outline', label: 'Broadcasts', color: theme.colors.accent, bg: '#FDF6EC', onPress: () => router.push('/(admin)/broadcasts') },
    { icon: 'cog-outline', label: 'Integrations', color: '#8B5CF6', bg: '#F5F3FF', onPress: () => router.push('/(admin)/integrations') },
  ];
  return <ProfileScreen tools={tools} toolsTitle="Admin Tools" />;
}
