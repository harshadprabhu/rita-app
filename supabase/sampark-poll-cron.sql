-- =====================================================================
-- RITA ↔ Sampark — inbound safety-net poll (cron)
-- =====================================================================
-- The sampark-webhook (Custom Trigger) is the real-time inbound path. This
-- poll is the backstop: it re-syncs status + technician notes for every
-- still-active linked ticket (open / in progress), so a dropped or misfired
-- trigger can't leave an update stranded. Cheap — it only touches active
-- tickets, not the whole history.
--
-- Every 5 minutes (not 2 hours) — confirmed live that the Custom Trigger
-- side isn't reliably firing (a resolved-on-Sampark ticket sat unsynced in
-- RITA for 25+ minutes with zero notification), so until that's verified
-- fixed on the Sampark/ManageEngine admin side, this is effectively the
-- primary inbound path, not just a rare-case backstop.
--
-- Requires: pg_cron + pg_net. Replace <ANON_KEY>.
-- =====================================================================

select cron.schedule(
  'sampark-poll',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := 'https://ftzczoiucqrirkcpzdyl.supabase.co/functions/v1/sampark-poll',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON_KEY>"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);
