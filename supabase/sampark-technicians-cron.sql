-- =====================================================================
-- RITA ↔ Sampark — technician roster + availability sync (cron)
-- =====================================================================
-- Pulls the licensed Sampark technician roster (and each one's availability
-- signal) into public.sampark_technicians. Sampark exposes no presence
-- webhook, so this short-interval sync is how the "green" availability stays
-- fresh; the table is in the realtime publication, so each update pushes to
-- the Connect screen instantly (the only lag is this cadence).
--
-- Every 2 minutes. Harmless no-op (returns blocked:scope) until the Zoho
-- refresh token gains the SDPOnDemand.users scope; self-activates once it does.
-- Requires: pg_cron + pg_net. Replace <ANON_KEY>.
-- =====================================================================

select cron.schedule(
  'sampark-technicians-sync',
  '*/2 * * * *',
  $$
  select net.http_post(
    url     := 'https://ftzczoiucqrirkcpzdyl.supabase.co/functions/v1/sampark-technicians-sync',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON_KEY>"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);
