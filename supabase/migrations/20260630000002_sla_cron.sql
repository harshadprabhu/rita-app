-- Schedule SLA breach checking every 5 minutes.
-- Replace <PROJECT_REF> and <ANON_KEY> with your Supabase project's values after provisioning.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'check-sla-breaches',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/check-sla-breaches',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON_KEY>"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);
