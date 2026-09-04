-- =====================================================================
-- RITA — Store member profiles ("Netflix profiles")
-- =====================================================================
-- A store logs in with ONE shared AD account, but several staff use it. This
-- lets that shared account hold multiple lightweight member profiles — each a
-- name + avatar + phone — so a ticket carries the actual person's contact,
-- not the shared account's. The active profile is chosen on-device (like
-- picking a Netflix profile) and its phone auto-fills new tickets.
--
-- These are NOT auth accounts (no login, no RLS role) — just labels owned by
-- the shared account. Idempotent; applied live via:
--   supabase db query --linked < supabase/member-profiles-setup.sql
-- =====================================================================

create table if not exists public.member_profiles (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  phone text check (phone ~ '^[0-9]{10}$'),
  avatar_color text,            -- a palette key/hex for the avatar tile
  avatar_emoji text,            -- optional emoji shown on the tile
  created_at timestamptz not null default now()
);

create index if not exists idx_member_profiles_account on public.member_profiles (account_id, created_at);

alter table public.member_profiles enable row level security;

-- The shared account (any signed-in user) manages ONLY its own member profiles.
drop policy if exists "member_profiles: own read" on public.member_profiles;
create policy "member_profiles: own read" on public.member_profiles
  for select using (account_id = (select auth.uid()));

drop policy if exists "member_profiles: own insert" on public.member_profiles;
create policy "member_profiles: own insert" on public.member_profiles
  for insert with check (account_id = (select auth.uid()));

drop policy if exists "member_profiles: own update" on public.member_profiles;
create policy "member_profiles: own update" on public.member_profiles
  for update using (account_id = (select auth.uid()));

drop policy if exists "member_profiles: own delete" on public.member_profiles;
create policy "member_profiles: own delete" on public.member_profiles
  for delete using (account_id = (select auth.uid()));

-- Carry the chosen member profile onto the ticket for display + contact.
alter table public.tickets add column if not exists member_profile_id uuid references public.member_profiles(id) on delete set null;
alter table public.tickets add column if not exists member_profile_name text;
