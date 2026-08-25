import { TicketListScreen } from '../../components/tickets/TicketListScreen';
import { useAuthStore } from '../../stores/authStore';

// Everyone at a store sees every ticket raised from that store — not
// just their own — so the store team stays aware of status without
// needing to ask each other. (Was previously limited to the requester,
// with only the shared Store Tablet account getting the store view.)
export default function UserTickets() {
  const profile = useAuthStore((s) => s.profile);
  return (
    <TicketListScreen
      title="Store Tickets"
      filters={{ store_id: profile?.store_id ?? undefined }}
      showCreateButton
    />
  );
}
