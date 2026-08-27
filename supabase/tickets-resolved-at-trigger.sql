-- Auto-stamp tickets.resolved_at whenever status transitions to 'resolved',
-- and clear it on any transition back OUT of resolved. Belt-and-braces
-- backstop so resolution_time analytics don't drop rows just because a
-- client path (updateTicket, an admin quick-action, a future edge fn)
-- forgot to set resolved_at explicitly.
--
-- Apply live with:
--   supabase db query --linked < supabase/tickets-resolved-at-trigger.sql

create or replace function set_ticket_resolved_at() returns trigger as $$
begin
  if new.status = 'resolved' and (old.status is distinct from 'resolved') and new.resolved_at is null then
    new.resolved_at := now();
  end if;
  if new.status <> 'resolved' and old.status = 'resolved' then
    new.resolved_at := null;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists tickets_set_resolved_at on tickets;
create trigger tickets_set_resolved_at
  before update of status on tickets
  for each row execute function set_ticket_resolved_at();

-- Backfill: any ticket already at status='resolved' with a null resolved_at
-- gets stamped with its updated_at (best available proxy for the actual
-- resolution moment) so historical analytics have data to work with.
update tickets
  set resolved_at = coalesce(updated_at, created_at)
  where status = 'resolved' and resolved_at is null;
