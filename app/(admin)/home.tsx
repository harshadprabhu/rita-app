import { HomeDashboard } from '../../components/home/HomeDashboard';

export default function AdminHome() {
  return (
    <HomeDashboard
      stats={[
        { label: 'Open', filters: { status: 'open' }, color: '#3B82F6' },
        { label: 'In Progress', filters: { status: 'in_progress' }, color: '#F59E0B' },
        { label: 'Resolved', filters: { status: 'resolved' }, color: '#10B981' },
        { label: 'SLA Breached', filters: { sla_breached: true }, color: '#DC2626' },
      ]}
    />
  );
}
