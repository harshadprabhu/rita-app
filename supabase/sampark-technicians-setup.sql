-- =====================================================================
-- RITA — Sampark technician roster (source of truth for Connect)
-- =====================================================================
-- The Connect screen lists technicians licensed in Sampark (not RITA
-- profiles). A sync edge fn (sampark-technicians-sync) pulls the roster from
-- Sampark's /technicians API and upserts it here, pre-matching each Sampark
-- technician to a RITA account by email so the app can DM them in-app.
--
-- Availability: Sampark exposes no presence webhook, so the sync also captures
-- whatever "online/available" signal the technician record carries and writes
-- it to `online`. The table is in the realtime publication, so when the sync
-- updates a row the Connect screen updates instantly (client-side realtime);
-- the only lag is the sync cadence, not the client.
--
-- BLOCKED until the Zoho refresh token gains the SDPOnDemand.users scope
-- (/technicians currently 401s). Table + wiring ship dormant; the roster
-- populates the moment the scope is added. Idempotent; apply live via:
--   supabase db query --linked < supabase/sampark-technicians-setup.sql
-- =====================================================================

create table if not exists public.sampark_technicians (
  sampark_id text primary key,
  name text,
  email text,
  -- Matched RITA account (by email). Only rows with this set are shown in
  -- Connect (chat needs a RITA account). null = licensed in Sampark but not
  -- on RITA yet.
  rita_profile_id uuid references public.profiles(id) on delete set null,
  -- Availability derived from Sampark's own technician record (the "green"
  -- signal). Best-effort until the real field is confirmed against live data.
  online boolean not null default false,
  online_source text,          -- which Sampark field drove `online` (for auditing)
  raw jsonb,                   -- full Sampark technician record, for refinement
  last_synced_at timestamptz not null default now()
);

create index if not exists idx_sampark_tech_rita on public.sampark_technicians (rita_profile_id);
create index if not exists idx_sampark_tech_online on public.sampark_technicians (online);

alter table public.sampark_technicians enable row level security;

-- Readable by any signed-in user (Connect renders it); only the service role
-- (sync edge fn) writes, so no insert/update/delete policy is granted.
drop policy if exists "sampark_technicians: read" on public.sampark_technicians;
create policy "sampark_technicians: read" on public.sampark_technicians
  for select using ((select auth.uid()) is not null);

-- Realtime so Connect reflects roster/availability changes the instant the
-- sync writes them.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sampark_technicians'
  ) then
    alter publication supabase_realtime add table public.sampark_technicians;
  end if;
end $$;
