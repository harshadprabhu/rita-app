-- =====================================================================
-- RITA ↔ Sampark — inbound safety-net poll (cron)
-- =====================================================================
-- The sampark-webhook (Custom Trigger) is the real-time inbound path. This
-- poll is the backstop: it re-syncs status + technician notes for every
-- still-active linked ticket (open / in progress), so a dropped or misfired
-- trigger can't leave an update stranded. Cheap — it only touches active
-- tickets, not the whole history.
--
-- Every 1 minute (was 5, was 2 hours) — the Sampark Custom Trigger (the
-- truly-instant webhook path) isn't reliably firing (a resolved-on-Sampark
-- ticket sat unsynced for 25+ minutes with zero notification), so this poll
-- is effectively the PRIMARY inbound path. At 1-minute cadence an inbound
-- technician reply/notification lands within ≤60s. The open chat screen
-- then refetches instantly off the resulting notifications INSERT
-- (Supabase realtime), and its own 2s poll covers the screen-open case.
-- Notifications are deduped by sampark_note_id (partial unique index), so a
-- 1-min re-scan never re-notifies an already-seen message. Only active
-- (open/in_progress) linked tickets are scanned, bounding the API load.
--
-- True instant delivery requires the ManageEngine Custom Trigger to POST
-- sampark-webhook on note-add/reply — a Sampark-admin config, not code.
--
-- Requires: pg_cron + pg_net. Replace <ANON_KEY>.
-- =====================================================================

select cron.schedule(
  'sampark-poll',
  '* * * * *',
  $$
  select net.http_post(
    url     := 'https://ftzczoiucqrirkcpzdyl.supabase.co/functions/v1/sampark-poll',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON_KEY>"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);
