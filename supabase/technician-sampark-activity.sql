-- =====================================================================
-- RITA — Technician "active in Sampark" signal
-- =====================================================================
-- Sampark (ManageEngine SDP) has no live presence API, so we approximate
-- "online in Sampark" as "acted in Sampark recently". The inbound sync
-- (sampark-webhook / sampark-poll) stamps this timestamp whenever it sees a
-- technician reply, add a note, or own an active request. The Connect screen
-- then shows a technician as available (green) if they're present in RITA
-- OR were active in Sampark within the last few minutes.
--
-- Idempotent; applied live via:
--   supabase db query --linked < supabase/technician-sampark-activity.sql
-- =====================================================================

alter table public.profiles add column if not exists last_sampark_active_at timestamptz;
