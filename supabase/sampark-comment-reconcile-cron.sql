-- =====================================================================
-- RITA — Sampark comment reconciliation (cron)
-- =====================================================================
-- The real-time path (comment_to_sampark trigger -> sampark-comment-push)
-- is a single fire-and-forget net.http_post with no retry. In practice a
-- transient Sampark/Zoho hiccup drops a note permanently with zero
-- user-facing signal — confirmed live: several stuck RITA comments pushed
-- successfully on a bare manual retry moments after the original silent
-- failure. sampark-comment-push now supports ?reconcile=1, which finds
-- every comment still missing sampark_note_id and retries each (with its
-- own internal 3x retry). Runs every 15 minutes — cheap (skips instantly
-- when nothing is stuck) and keeps RITA->Sampark comment sync effectively
-- self-healing instead of requiring manual intervention.
--
-- Requires: pg_cron + pg_net. Replace <ANON_KEY>.
-- =====================================================================

select cron.schedule(
  'sampark-comment-reconcile',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := 'https://ftzczoiucqrirkcpzdyl.supabase.co/functions/v1/sampark-comment-push?reconcile=1',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON_KEY>"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);
