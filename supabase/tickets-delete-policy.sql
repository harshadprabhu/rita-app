-- Missing DELETE RLS on tickets.
--
-- The initial schema (supabase/migrations/20260630000001_rls_policies.sql
-- and supabase/full-setup.sql) declared select/insert/update policies for
-- tickets but no delete policy. Since RLS is deny-by-default, the admin
-- ticket menu's Delete action was silently deleting zero rows — no error
-- surfaced, so the button appeared to do nothing.
--
-- Mirrors the "tickets: staff update" policy: admins and technicians can
-- delete any ticket. Managers/users have no delete path from the UI, so
-- they're intentionally not included here.
--
-- Apply live with:
--   supabase db query --linked < supabase/tickets-delete-policy.sql

drop policy if exists "tickets: staff delete" on tickets;
create policy "tickets: staff delete" on tickets for delete
  using (current_role_is(array['admin','technician']::user_role[]));
