-- Sampark note bodies now live only in Sampark (single source of truth). The
-- webhook + poll no longer insert into ticket_comments; instead they insert
-- a lean notifications row per newly-seen Sampark note so the requester gets
-- an OS push. This column + unique index dedupes repeat pulls of the same
-- note across webhook fires and cron polls so the same note doesn't create
-- multiple pushes.

alter table public.notifications
  add column if not exists sampark_note_id text;

create unique index if not exists notifications_sampark_note_recipient_uk
  on public.notifications (recipient_id, sampark_note_id)
  where sampark_note_id is not null;
