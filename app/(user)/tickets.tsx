import { TicketListScreen } from '../../components/tickets/TicketListScreen';
import { useAuthStore } from '../../stores/authStore';

export default function UserTickets() {
  const profile = useAuthStore((s) => s.profile);
  return <TicketListScreen title="My Tickets" filters={{ requester_id: profile?.id }} showCreateButton />;
}
