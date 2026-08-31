import { HomeDashboard } from '../../components/home/HomeDashboard';
import { useAuthStore } from '../../stores/authStore';

const TICKETS = '/(user)/tickets' as const;

export default function UserHome() {
  const profile = useAuthStore((s) => s.profile);
  // Everyone at a store now sees the store's tickets — not just their own —
  // so the whole store team stays in sync on status without side channels.
  const scope = { store_id: profile?.store_id ?? undefined };

  return (
    <HomeDashboard
      showCreateButton
      showGoldRate
      stats={[
        { label: 'Open (Store)', filters: { ...scope, status: 'open' }, color: '#3B82F6', icon: 'ellipse-outline', href: { pathname: TICKETS, params: { status: 'open' } } },
        { label: 'In Progress', filters: { ...scope, status: 'in_progress' }, color: '#F59E0B', icon: 'sync-outline', href: { pathname: TICKETS, params: { status: 'in_progress' } } },
        { label: 'Resolved', filters: { ...scope, status: 'resolved' }, color: '#10B981', icon: 'checkmark-circle-outline', href: { pathname: TICKETS, params: { status: 'resolved' } } },
      ]}
    />
  );
}
