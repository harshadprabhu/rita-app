import React from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ProfileScreen, ProfileTool } from '../../components/common/ProfileScreen';
import { theme } from '../../constants/theme';

export default function UserProfile() {
  const { t } = useTranslation();
  const tools: ProfileTool[] = [
    { icon: 'megaphone-outline', label: t('announcements.title'), color: theme.colors.accent, bg: '#FDF6EC', onPress: () => router.push('/(user)/announcements') },
  ];
  return <ProfileScreen tools={tools} />;
}
