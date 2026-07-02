import { HomeDashboard } from '../../components/home/HomeDashboard';

export default function AdminHome() {
  return (
    <HomeDashboard
      stats={[
        { label: 'Open', filters: { status: 'open' }, color: '#3B82F6', icon: 'ellipse-outline' },
        { label: 'In Progress', filters: { status: 'in_progress' }, color: '#F59E0B', icon: 'sync-outline' },
        { label: 'Resolved', filters: { status: 'resolved' }, color: '#10B981', icon: 'checkmark-circle-outline' },
        { label: 'SLA Breached', filters: { sla_breached: true }, color: '#DC2626', icon: 'alert-circle-outline' },
      ]}
    />
  );
}
