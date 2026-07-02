import { HomeDashboard } from '../../components/home/HomeDashboard';
import { useAuthStore } from '../../stores/authStore';

export default function UserHome() {
  const profile = useAuthStore((s) => s.profile);
  const requesterId = profile?.id ?? '';
  return (
    <HomeDashboard
      showCreateButton
      stats={[
        { label: 'Open Tickets', filters: { requester_id: requesterId, status: 'open' }, color: '#3B82F6' },
        { label: 'In Progress', filters: { requester_id: requesterId, status: 'in_progress' }, color: '#F59E0B' },
        { label: 'Resolved', filters: { requester_id: requesterId, status: 'resolved' }, color: '#10B981' },
      ]}
    />
  );
}
