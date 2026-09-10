-- =====================================================================
-- RITA — Alert-side de-duplication of OS pushes
-- =====================================================================
-- RCA: the notifications layer had NO idempotency. `notify_notification_push`
-- fired an OS push on EVERY insert, and no producer (assignment sync, status
-- sync, ticket-created fan-out) checked whether the same alert was already
-- sent. So anything that re-evaluated the same state — a poll re-detecting an
-- unchanged assignee, a double-submit, duplicate same-name profiles — inserted
-- another row and pushed the SAME alert again. Only `ticket_comment` had a
-- (producer-side) dedup via sampark_note_id.
--
-- Fix (safety net at the alert layer): before pushing, skip the OS push when
-- an identical alert (same recipient + title + body + sampark_note_id) was
-- already created in the recent window. The row is still kept for in-app
-- history; only the redundant PUSH is suppressed. Distinct events differ in
-- body (different technician / status / comment), so genuine alerts are never
-- swallowed. Idempotent; apply live via:
--   supabase db query --linked < supabase/notification-push-dedup.sql
-- =====================================================================

create or replace function public.notify_notification_push() returns trigger as $$
begin
  -- De-dupe: if the exact same alert already went out to this recipient in the
  -- last 6 hours, keep the new row but do NOT fire another OS push.
  if exists (
    select 1 from public.notifications n
    where n.recipient_id = new.recipient_id
      and n.title = new.title
      and coalesce(n.body, '') = coalesce(new.body, '')
      and coalesce(n.sampark_note_id, '') = coalesce(new.sampark_note_id, '')
      and n.id <> new.id
      and n.created_at > now() - interval '6 hours'
  ) then
    return new;
  end if;

  perform net.http_post(
    url := 'https://ftzczoiucqrirkcpzdyl.supabase.co/functions/v1/send-push',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0emN6b2l1Y3FyaXJrY3B6ZHlsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4ODEyNjgsImV4cCI6MjA5ODQ1NzI2OH0.Ajf9VNR7lUjWZYdwvgk7bNcVBrlOUIEi0jWgKfmZJlI"}'::jsonb,
    body := jsonb_build_object(
      'title', new.title,
      'body', new.body,
      'user_ids', array[new.recipient_id],
      'data', jsonb_build_object('ticketId', new.ticket_id)
    )
  );
  return new;
end;
$$ language plpgsql security definer;
