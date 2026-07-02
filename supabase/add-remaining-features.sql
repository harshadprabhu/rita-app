-- =====================================================================
-- RITA — Gold Rate, Broadcast Read-Tracking, and SLA-style cron setup
-- =====================================================================
-- Adds everything the newly-ported Gold Rate + Broadcasts/Announcements
-- features need: the gold_rates table (fed by the sync-gold-rate edge
-- function), the broadcast_reads table (lib/api/broadcasts.ts already
-- expects this — it was missing), and a cron schedule to keep gold rates
-- fresh.
--
-- HOW TO USE: Supabase → SQL Editor → New query → paste this → Run.
-- Before running the cron block at the bottom, replace <PROJECT_REF> and
-- <ANON_KEY> with your real values (same pattern as
-- supabase/migrations/20260630000002_sla_cron.sql).
-- =====================================================================

-- ---------- 1. gold_rates ----------
create table if not exists gold_rates (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null,
  metal text not null,
  purity text not null,
  rate numeric not null,
  currency text not null default 'INR',
  updated_at timestamptz not null default now(),
  unique (entry_date, metal, purity)
);

alter table gold_rates enable row level security;

drop policy if exists "gold_rates: authenticated read" on gold_rates;
create policy "gold_rates: authenticated read" on gold_rates for select to authenticated using (true);
-- Writes only happen via the sync-gold-rate edge function using the
-- service-role key, which bypasses RLS entirely — no insert/update policy
-- is needed (or wanted) here.

-- ---------- 2. broadcast_reads ----------
create table if not exists broadcast_reads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  broadcast_id uuid not null references broadcasts(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, broadcast_id)
);

alter table broadcast_reads enable row level security;

drop policy if exists "broadcast_reads: own read" on broadcast_reads;
create policy "broadcast_reads: own read" on broadcast_reads for select using (user_id = auth.uid());

drop policy if exists "broadcast_reads: own insert" on broadcast_reads;
create policy "broadcast_reads: own insert" on broadcast_reads for insert with check (user_id = auth.uid());

-- ---------- 3. Gold rate sync cron (every 5 min, 10:00-22:00 IST) ----------
-- Run this block separately after replacing the placeholders below.
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- CREATE EXTENSION IF NOT EXISTS pg_net;
--
-- SELECT cron.schedule(
--   'sync-gold-rate',
--   '*/5 4-16 * * *',
--   $$
--   SELECT net.http_post(
--     url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/sync-gold-rate',
--     headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON_KEY>"}'::jsonb,
--     body    := '{}'::jsonb
--   );
--   $$
-- );
