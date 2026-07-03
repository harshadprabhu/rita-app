import { TicketListScreen } from '../../components/tickets/TicketListScreen';
import { useAuthStore } from '../../stores/authStore';

export default function ManagerAllTickets() {
  const profile = useAuthStore((s) => s.profile);
  return <TicketListScreen title="Store Tickets" filters={{ store_id: profile?.store_id ?? undefined }} enableFilters />;
}
