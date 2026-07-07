import { HomeDashboard } from '../../components/home/HomeDashboard';
import { useAuthStore } from '../../stores/authStore';

const TICKETS = '/(user)/tickets' as const;

export default function UserHome() {
  const profile = useAuthStore((s) => s.profile);
  const requesterId = profile?.id ?? '';
  return (
    <HomeDashboard
      showCreateButton
      showGoldRate
      stats={[
        { label: 'Open Tickets', filters: { requester_id: requesterId, status: 'open' }, color: '#3B82F6', icon: 'ellipse-outline', href: { pathname: TICKETS, params: { status: 'open' } } },
        { label: 'In Progress', filters: { requester_id: requesterId, status: 'in_progress' }, color: '#F59E0B', icon: 'sync-outline', href: { pathname: TICKETS, params: { status: 'in_progress' } } },
        { label: 'Resolved', filters: { requester_id: requesterId, status: 'resolved' }, color: '#10B981', icon: 'checkmark-circle-outline', href: { pathname: TICKETS, params: { status: 'resolved' } } },
      ]}
    />
  );
}
