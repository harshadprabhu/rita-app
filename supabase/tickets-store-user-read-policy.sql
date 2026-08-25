-- Store-wide ticket visibility for plain users.
--
-- Original policy "tickets: own read" (requester_id = auth.uid()) meant a
-- user only saw tickets they raised themselves. Feedback: everyone at a
-- store should see every ticket raised from that store, so the whole
-- store stays aware of status without side-channel discussion.
--
-- Add a select policy for role in (user, in_store_manager) scoped to
-- their current store. The existing "own read" policy is kept as-is so
-- a user detached from a store (no current_store_id) still sees at
-- least their own tickets.
--
-- Apply live with:
--   supabase db query --linked < supabase/tickets-store-user-read-policy.sql

drop policy if exists "tickets: store user read" on tickets;
create policy "tickets: store user read" on tickets for select
  using (
    current_role_is(array['user','in_store_manager']::user_role[])
    and store_id = current_store_id()
  );
