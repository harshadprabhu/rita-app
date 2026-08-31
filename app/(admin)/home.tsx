import { HomeDashboard } from '../../components/home/HomeDashboard';

const TICKETS = '/(admin)/all-tickets' as const;

export default function AdminHome() {
  return (
    <HomeDashboard
      showGoldRate
      showCreateButton
      stats={[
        { label: 'Open', filters: { status: 'open' }, color: '#3B82F6', icon: 'ellipse-outline', href: { pathname: TICKETS, params: { status: 'open' } } },
        { label: 'In Progress', filters: { status: 'in_progress' }, color: '#F59E0B', icon: 'sync-outline', href: { pathname: TICKETS, params: { status: 'in_progress' } } },
        { label: 'Resolved', filters: { status: 'resolved' }, color: '#10B981', icon: 'checkmark-circle-outline', href: { pathname: TICKETS, params: { status: 'resolved' } } },
        { label: 'SLA Breached', filters: { sla_breached: true }, color: '#DC2626', icon: 'alert-circle-outline', href: { pathname: TICKETS, params: { sla: '1' } } },
      ]}
    />
  );
}
