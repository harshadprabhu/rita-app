-- =====================================================================
-- RITA — Sampark daily category sync (cron)
-- =====================================================================
-- Runs the sampark-sync edge function daily at 21:15 UTC (02:45 IST) to keep
-- ticket_categories in step with Sampark. It derives the taxonomy from recent
-- incidents (?pages=5 ≈ 500 latest requests) rather than the /categories
-- metadata endpoint, which needs a setup OAuth scope we don't request.
--
-- Requires: pg_cron + pg_net. Replace <ANON_KEY>.
-- =====================================================================

select cron.schedule(
  'sampark-sync-categories',
  '15 21 * * *',
  $$
  select net.http_post(
    url     := 'https://ftzczoiucqrirkcpzdyl.supabase.co/functions/v1/sampark-sync?pages=5',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON_KEY>"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);
