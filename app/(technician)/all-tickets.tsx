import { TicketListScreen } from '../../components/tickets/TicketListScreen';

export default function TechnicianAllTickets() {
  // Technicians work a queue: search + status chips, plus an assignment row
  // (All / Unassigned / Assigned to me) so they can find tickets to pick up.
  // Picking up / resolving / reassigning from the card menu mirrors to Sampark.
  return <TicketListScreen title="All Tickets" filters={{}} enableFilters enableAssignmentFilter />;
}
