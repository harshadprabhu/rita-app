-- Enable realtime on every table the app subscribes to. RCA: `supabase_realtime`
-- only had `gold_rates`, so all the useEffect-driven channel subscriptions in
-- useNotifications, useUnifiedNotifications, TicketDetail-wired subscriptions,
-- etc. were connecting to Realtime successfully but never receiving row events
-- because the source tables were not published. Comments in particular felt
-- "not realtime" — you had to pull-to-refresh to see a technician's reply —
-- because ticket_comments never emitted.

do $$
begin
  -- alter publication add fails if the table is already a member; catch and
  -- ignore so this file stays idempotent.
  begin alter publication supabase_realtime add table public.ticket_comments; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.tickets;         exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.notifications;   exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.broadcasts;      exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.broadcast_reads; exception when duplicate_object then null; end;
end $$;

-- REPLICA IDENTITY defaults to primary key columns only, which is enough for
-- the `event: 'INSERT'` and event-per-row filters we use. Not switching to
-- FULL — that would ship every column of every UPDATE across the wire,
-- which is wasteful for tables like tickets that get frequent updates.
