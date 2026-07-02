import { TicketListScreen } from '../../components/tickets/TicketListScreen';
import { useAuthStore } from '../../stores/authStore';

export default function TechnicianMyTickets() {
  const profile = useAuthStore((s) => s.profile);
  return <TicketListScreen title="My Assignments" filters={{ assignee_id: profile?.id }} />;
}
