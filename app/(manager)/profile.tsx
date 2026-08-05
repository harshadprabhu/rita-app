import React from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ProfileScreen, ProfileTool } from '../../components/common/ProfileScreen';
import { useAuthStore } from '../../stores/authStore';
import { canPushPromotions, canReviewChecklists } from '../../constants/roles';
import { theme } from '../../constants/theme';

export default function ManagerProfile() {
  const { t } = useTranslation();
  const profile = useAuthStore((s) => s.profile);

  const tools: ProfileTool[] = [
    { icon: 'megaphone-outline', label: t('announcements.title'), color: theme.colors.accent, bg: '#FDF6EC', onPress: () => router.push('/(manager)/announcements') },
    { icon: 'send-outline', label: t('broadcasts.title'), color: '#6366F1', bg: '#EEF2FF', onPress: () => router.push('/(manager)/broadcasts') },
  ];

  // Ops Managers get the extra promotions tool; plain Managers don't.
  if (profile && canPushPromotions(profile.role)) {
    tools.push({ icon: 'pricetag', label: 'Promotions', color: '#059669', bg: '#ECFDF5', onPress: () => router.push('/(manager)/promotions') });
  }
  if (profile && canReviewChecklists(profile.role)) {
    tools.push({ icon: 'checkbox', label: 'Checklists', color: '#0EA5E9', bg: '#EFF8FF', onPress: () => router.push('/(manager)/checklist-review') });
  }

  return <ProfileScreen tools={tools} />;
}
