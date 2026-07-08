import { TicketListScreen } from '../../components/tickets/TicketListScreen';
import { useAuthStore } from '../../stores/authStore';

// Shared store-tablet accounts see the whole store's tickets; an individual
// user sees only their own.
const isStoreTablet = (designation?: string | null) => designation === 'Store Tablet';

export default function UserTickets() {
  const profile = useAuthStore((s) => s.profile);
  const tablet = isStoreTablet(profile?.designation);
  return (
    <TicketListScreen
      title={tablet ? 'Store Tickets' : 'My Tickets'}
      filters={tablet ? { store_id: profile?.store_id ?? undefined } : { requester_id: profile?.id }}
      showCreateButton
    />
  );
}
