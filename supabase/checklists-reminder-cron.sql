-- =====================================================================
-- RITA — Saksham checklist daily reminder (cron)
-- =====================================================================
-- Runs once daily at 05:30 UTC (11:00 IST) — checked against the
-- checklists-setup.sql submission_date default (Asia/Kolkata), not tied to
-- opening/closing-specific due times since store hours aren't modeled
-- anywhere in the `stores` table today. Fires checklist-reminder, which
-- inserts a Daily Alerts notification for every in_store_manager whose
-- store hasn't submitted one or more of today's checklists yet.
--
-- Requires: pg_cron + pg_net. Replace <ANON_KEY>.
-- =====================================================================

select cron.schedule(
  'checklist-reminder',
  '30 5 * * *',
  $$
  select net.http_post(
    url     := 'https://ftzczoiucqrirkcpzdyl.supabase.co/functions/v1/checklist-reminder',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON_KEY>"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);
