-- Store-wide ticket visibility for plain users.
--
-- Original policy "tickets: own read" (requester_id = auth.uid()) meant a
-- user only saw tickets they raised themselves. Feedback: everyone at a
-- store should see every ticket raised from that store, so the whole
-- store stays aware of status without side-channel discussion.
--
-- Exception: HO (Head Office) users. Their "store" is a per-department
-- bucket (id like 'HO-…') shared across many unrelated colleagues, so
-- store-wide read leaks tickets between HO staff who shouldn't see each
-- other's cases. HO accounts fall back to the base "tickets: own read"
-- policy — their own tickets only.
--
-- Apply live with:
--   supabase db query --linked < supabase/tickets-store-user-read-policy.sql

drop policy if exists "tickets: store user read" on tickets;
create policy "tickets: store user read" on tickets for select
  using (
    current_role_is(array['user','in_store_manager']::user_role[])
    and store_id = current_store_id()
    and current_store_id() not like 'HO-%'
  );
