-- =====================================================================
-- RITA — OPTIONAL: enable photo/file attachments on tickets
-- =====================================================================
-- The app works fine without this — tickets, chat, and the bot all run
-- without it. Do this only if you want users to attach photos to tickets.
--
-- HOW TO USE: Supabase → SQL Editor → New query → paste this → Run.
--
-- If you get an error like "must be owner of table objects", use the UI
-- instead: Supabase → Storage → New bucket → name it exactly
-- "ticket-attachments" → tick "Public bucket" → Save. Then Storage →
-- Policies → New policy → "For full customization" → allow INSERT and
-- SELECT for the "authenticated" role on that bucket.
-- =====================================================================

insert into storage.buckets (id, name, public)
values ('ticket-attachments', 'ticket-attachments', true)
on conflict (id) do nothing;

create policy "ticket files: read"
  on storage.objects for select
  using (bucket_id = 'ticket-attachments');

create policy "ticket files: upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'ticket-attachments');

create policy "ticket files: delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'ticket-attachments');
