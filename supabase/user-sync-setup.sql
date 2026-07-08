-- =====================================================================
-- RITA — SSO (Entra) user sync (daily cron)
-- =====================================================================
-- Downloads RITA-eligible users from Microsoft Entra via Graph — the members
-- of the NJ_Regular Profile and NJ_Store Tablets security groups — into the
-- `workers` table (email, name, phone). Replaces the former D365 worker sync.
-- On first SSO sign-in, ensureProfile matches the signed-in email to pre-fill
-- the profile; the store is derived from the AD login id (storeFromAdId).
--
-- REQUIRES (Azure admin, one-time): the SSO app registration must be granted
-- the Microsoft Graph *application* permission GroupMember.Read.All (or
-- Group.Read.All) with admin consent — otherwise the sync gets HTTP 403
-- Authorization_RequestDenied.
--
-- Runs daily at 21:00 UTC (02:30 IST). Replace <ANON_KEY>.
-- =====================================================================

select cron.schedule(
  'sync-users',
  '0 21 * * *',
  $$
  select net.http_post(
    url     := 'https://ftzczoiucqrirkcpzdyl.supabase.co/functions/v1/sync-users',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON_KEY>"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);
