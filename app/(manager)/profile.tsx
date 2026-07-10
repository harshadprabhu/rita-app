import React from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ProfileScreen, ProfileTool } from '../../components/common/ProfileScreen';
import { theme } from '../../constants/theme';

export default function ManagerProfile() {
  const { t } = useTranslation();
  const tools: ProfileTool[] = [
    { icon: 'megaphone-outline', label: t('announcements.title'), color: theme.colors.accent, bg: '#FDF6EC', onPress: () => router.push('/(manager)/announcements') },
    { icon: 'send-outline', label: t('broadcasts.title'), color: '#6366F1', bg: '#EEF2FF', onPress: () => router.push('/(manager)/broadcasts') },
  ];
  return <ProfileScreen tools={tools} />;
}
