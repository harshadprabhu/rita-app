import { HomeDashboard } from '../../components/home/HomeDashboard';
import { useAuthStore } from '../../stores/authStore';

const TICKETS = '/(user)/tickets' as const;

export default function UserHome() {
  const profile = useAuthStore((s) => s.profile);
  // Store-tablet accounts are shared devices — scope stats to the whole store;
  // individual users see only their own tickets.
  const tablet = profile?.designation === 'Store Tablet';
  const scope = tablet ? { store_id: profile?.store_id ?? undefined } : { requester_id: profile?.id ?? '' };

  return (
    <HomeDashboard
      showCreateButton
      showGoldRate
      stats={[
        { label: tablet ? 'Open (Store)' : 'Open Tickets', filters: { ...scope, status: 'open' }, color: '#3B82F6', icon: 'ellipse-outline', href: { pathname: TICKETS, params: { status: 'open' } } },
        { label: 'In Progress', filters: { ...scope, status: 'in_progress' }, color: '#F59E0B', icon: 'sync-outline', href: { pathname: TICKETS, params: { status: 'in_progress' } } },
        { label: 'Resolved', filters: { ...scope, status: 'resolved' }, color: '#10B981', icon: 'checkmark-circle-outline', href: { pathname: TICKETS, params: { status: 'resolved' } } },
      ]}
    />
  );
}
