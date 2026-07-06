-- =====================================================================
-- RITA — D365 worker master sync (table + daily cron)
-- =====================================================================
-- Pulls the D365 F&O Workers entity into a `workers` staging table keyed by
-- Azure AD email (IdentityEmail). On first SSO sign-in the app matches a
-- worker by email and pre-fills the profile (real name, phone, and store when
-- D365's address book resolves one), so employees never fill a sign-up form.
--
-- Store resolution: Workers.AddressBooks (";"-separated, e.g. "NS0005") →
-- RetailStoreAddressBooks (Employee-type) → store RetailChannelId →
-- stores.retail_channel_id → stores.id.
--
-- Requires: pg_cron + pg_net (already enabled). Replace <ANON_KEY>.
-- =====================================================================

create table if not exists workers (
  email            text primary key,
  personnel_number text,
  name             text,
  phone            text,
  store_id         text,
  updated_at       timestamptz not null default now()
);
alter table workers enable row level security;
drop policy if exists workers_read on workers;
create policy workers_read on workers for select using (true);

-- The channel code (NS####) each worker address book points at, used to join
-- workers to stores. Populated by the sync-stores edge function.
alter table stores add column if not exists retail_channel_id text;

-- Daily worker sync at 21:00 UTC (02:30 IST), just after the store sync.
select cron.schedule(
  'sync-workers',
  '0 21 * * *',
  $$
  select net.http_post(
    url     := 'https://ftzczoiucqrirkcpzdyl.supabase.co/functions/v1/sync-workers',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON_KEY>"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);
