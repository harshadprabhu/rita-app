-- =====================================================================
-- RITA — Daily D365 store-master sync (cron schedule)
-- =====================================================================
-- Runs the `sync-stores` edge function once a day at 20:30 UTC (02:00 IST)
-- to refresh the `stores` table (onboarding store picker + broadcast
-- targeting) from D365 F&O's RetailStores entity.
--
-- Requires: pg_cron + pg_net (already enabled for sync-gold-rate).
--
-- HOW TO USE: Supabase → SQL Editor → paste → replace <ANON_KEY> with the
-- project's anon key (same one sync-gold-rate's cron uses) → Run.
-- =====================================================================

select cron.schedule(
  'sync-stores',
  '30 20 * * *',
  $$
  select net.http_post(
    url     := 'https://ftzczoiucqrirkcpzdyl.supabase.co/functions/v1/sync-stores',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON_KEY>"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);

-- Run once immediately to populate the table (optional):
--   select net.http_post(
--     url     := 'https://ftzczoiucqrirkcpzdyl.supabase.co/functions/v1/sync-stores',
--     headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON_KEY>"}'::jsonb,
--     body    := '{}'::jsonb
--   );
