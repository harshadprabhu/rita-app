-- Missing DELETE policy on notifications. Without this, deleteAllNotifications
-- was silently denied by RLS (0 rows, no error), so the "Clear" trash button
-- did nothing at the DB layer — the badge count never dropped because the
-- rows persisted, and after re-sign-in the same alerts kept coming back.
drop policy if exists "notifications: own delete" on public.notifications;
create policy "notifications: own delete"
  on public.notifications
  for delete
  using (recipient_id = (select auth.uid()));
