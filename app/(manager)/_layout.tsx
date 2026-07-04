import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useNotificationStore } from '../../stores/notificationStore';
import { theme } from '../../constants/theme';

export default function ManagerLayout() {
  const { t } = useTranslation();
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const unreadAnnouncementCount = useNotificationStore((s) => s.unreadAnnouncementCount);
  const totalUnread = unreadCount + unreadAnnouncementCount;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.brand,
        tabBarInactiveTintColor: theme.colors.textTertiary,
        tabBarStyle: { borderTopColor: theme.colors.border, paddingBottom: theme.spacing.sm, height: 60 },
      }}
    >
      <Tabs.Screen name="home" options={{ title: t('tabs.home'), tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="all-tickets" options={{ title: t('tabs.allTickets'), tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" size={size} color={color} /> }} />
      <Tabs.Screen
        name="notifications"
        options={{
          title: t('tabs.alerts'),
          tabBarIcon: ({ color, size }) => <Ionicons name="notifications-outline" size={size} color={color} />,
          tabBarBadge: totalUnread > 0 ? totalUnread : undefined,
        }}
      />
      <Tabs.Screen name="announcements" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ href: null, tabBarStyle: { display: 'none' } }} />
    </Tabs>
  );
}
