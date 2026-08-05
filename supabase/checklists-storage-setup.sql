-- =====================================================================
-- RITA — checklist photo attachments bucket
-- =====================================================================
-- Kept separate from ticket-attachments: that bucket's storage RLS is
-- deliberately bucket-scoped only (no per-record check — access control
-- lives at the ticket_attachments table level instead), so a dedicated
-- bucket keeps checklist photos cleanly separable rather than reusing a
-- bucket named for a different domain.
--
-- HOW TO USE: Supabase → SQL Editor → New query → paste this → Run.
-- =====================================================================

insert into storage.buckets (id, name, public)
values ('checklist-attachments', 'checklist-attachments', true)
on conflict (id) do nothing;

drop policy if exists "checklist files: read" on storage.objects;
create policy "checklist files: read"
  on storage.objects for select
  using (bucket_id = 'checklist-attachments');

drop policy if exists "checklist files: upload" on storage.objects;
create policy "checklist files: upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'checklist-attachments');
