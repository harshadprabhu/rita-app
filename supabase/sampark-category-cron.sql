-- =====================================================================
-- RITA — Sampark daily category sync (cron)
-- =====================================================================
-- Runs the sampark-sync edge function daily at 21:15 UTC (02:45 IST) to keep
-- ticket_categories in step with Sampark. It derives the taxonomy from recent
-- incidents (?pages=30 ≈ 3000 latest requests) rather than the /categories
-- metadata endpoint, which needs a setup OAuth scope we don't request.
--
-- pages=30 (not the original 5) deliberately: each run's TF-IDF keyword pass
-- OVERWRITES the `keywords` column for every node it touches (see
-- samparkClassifier.ts, the auto-parse engine that reads it). A tiny daily
-- sample would replace a rich, well-trained keyword list with one built from
-- just a handful of tickets for any category that wasn't busy that day —
-- accuracy would silently degrade over time. 3000 keeps the sample large
-- enough that the learned keywords stay representative, not just recent noise.
--
-- Requires: pg_cron + pg_net. Replace <ANON_KEY>.
-- =====================================================================

select cron.schedule(
  'sampark-sync-categories',
  '15 21 * * *',
  $$
  select net.http_post(
    url     := 'https://ftzczoiucqrirkcpzdyl.supabase.co/functions/v1/sampark-sync?pages=30',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON_KEY>"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);
