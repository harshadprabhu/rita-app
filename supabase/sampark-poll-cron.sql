-- =====================================================================
-- RITA ↔ Sampark — inbound safety-net poll (cron)
-- =====================================================================
-- The sampark-webhook (Custom Trigger) is the real-time inbound path. This
-- poll is the backstop: every 2 hours it re-syncs status + technician notes
-- for every still-active linked ticket (open / in progress), so a dropped or
-- misfired trigger can't leave an update stranded. Cheap — it only touches
-- active tickets, not the whole history.
--
-- Requires: pg_cron + pg_net. Replace <ANON_KEY>.
-- =====================================================================

select cron.schedule(
  'sampark-poll',
  '0 */2 * * *',
  $$
  select net.http_post(
    url     := 'https://ftzczoiucqrirkcpzdyl.supabase.co/functions/v1/sampark-poll',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON_KEY>"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);
