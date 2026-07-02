import { HomeDashboard } from '../../components/home/HomeDashboard';
import { useAuthStore } from '../../stores/authStore';

export default function ManagerHome() {
  const profile = useAuthStore((s) => s.profile);
  const storeId = profile?.store_id ?? undefined;
  return (
    <HomeDashboard
      stats={[
        { label: 'Open (Store)', filters: { store_id: storeId, status: 'open' }, color: '#3B82F6' },
        { label: 'In Progress', filters: { store_id: storeId, status: 'in_progress' }, color: '#F59E0B' },
        { label: 'Resolved', filters: { store_id: storeId, status: 'resolved' }, color: '#10B981' },
        { label: 'SLA Breached', filters: { store_id: storeId, sla_breached: true }, color: '#DC2626' },
      ]}
    />
  );
}
