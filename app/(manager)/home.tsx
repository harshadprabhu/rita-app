import { router } from 'expo-router';
import { HomeDashboard } from '../../components/home/HomeDashboard';
import { useAuthStore } from '../../stores/authStore';
import { canPushPromotions } from '../../constants/roles';

const TICKETS = '/(manager)/all-tickets' as const;

export default function ManagerHome() {
  const profile = useAuthStore((s) => s.profile);
  const storeId = profile?.store_id ?? undefined;

  const quickActions = [
    { label: 'Broadcasts', icon: 'send-outline' as const, color: '#6366F1', bg: '#EEF2FF', onPress: () => router.push('/(manager)/broadcasts') },
    // Ops Managers get the extra Promotions shortcut; plain Managers don't.
    ...(profile && canPushPromotions(profile.role)
      ? [{ label: 'Promotions', icon: 'pricetag' as const, color: '#059669', bg: '#ECFDF5', onPress: () => router.push('/(manager)/promotions') }]
      : []),
  ];

  return (
    <HomeDashboard
      showGoldRate
      showCreateButton
      quickActions={quickActions}
      stats={[
        { label: 'Open (Store)', filters: { store_id: storeId, status: 'open' }, color: '#3B82F6', icon: 'ellipse-outline', href: { pathname: TICKETS, params: { status: 'open' } } },
        { label: 'Resolved', filters: { store_id: storeId, status: 'resolved' }, color: '#10B981', icon: 'checkmark-circle-outline', href: { pathname: TICKETS, params: { status: 'resolved' } } },
        { label: 'SLA Breached', filters: { store_id: storeId, sla_breached: true }, color: '#DC2626', icon: 'alert-circle-outline', href: { pathname: TICKETS, params: { sla: '1' } } },
      ]}
    />
  );
}
