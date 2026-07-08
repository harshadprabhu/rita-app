-- =====================================================================
-- RITA ↔ Sampark — Phase 2 (create-on-raise) + Phase 3 (webhook) schema
-- =====================================================================
-- Applied live already; kept for reproducibility.
--
-- ticket_comments now also holds notes synced back from Sampark technicians:
-- those have no RITA author, carry the technician's name in external_author,
-- and are de-duplicated by sampark_note_id.
-- =====================================================================

alter table ticket_comments alter column author_id drop not null;
alter table ticket_comments add column if not exists external_author  text;
alter table ticket_comments add column if not exists sampark_note_id  text;
create unique index if not exists ticket_comments_sampark_note_uidx
  on ticket_comments(sampark_note_id) where sampark_note_id is not null;
