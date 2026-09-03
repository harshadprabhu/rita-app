-- =====================================================================
-- RITA — Direct messages (user ↔ technician)
-- =====================================================================
-- A lightweight in-app 1:1 chat so a store user can reach out to a
-- technician directly — nudge them to pick up a ticket, or a casual
-- question. This has NO Sampark equivalent (Sampark has no person-to-person
-- chat API), so unlike ticket comments these DO live in Supabase. Realtime
-- delivery via the supabase_realtime publication.
--
-- Idempotent; applied live via:
--   supabase db query --linked < supabase/direct-messages-setup.sql
-- =====================================================================

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

-- Fast retrieval of a conversation between two people, newest last.
create index if not exists idx_dm_pair on public.direct_messages (
  least(sender_id, recipient_id), greatest(sender_id, recipient_id), created_at
);
create index if not exists idx_dm_recipient_unread on public.direct_messages (recipient_id, read_at);

alter table public.direct_messages enable row level security;

-- A participant (sender OR recipient) can read the message.
drop policy if exists "dm: participant read" on public.direct_messages;
create policy "dm: participant read" on public.direct_messages
  for select using (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()));

-- Only the sender can create a message, and only as themselves.
drop policy if exists "dm: sender insert" on public.direct_messages;
create policy "dm: sender insert" on public.direct_messages
  for insert with check (sender_id = (select auth.uid()));

-- The recipient can mark a message read (update read_at). Sender can't edit.
drop policy if exists "dm: recipient update" on public.direct_messages;
create policy "dm: recipient update" on public.direct_messages
  for update using (recipient_id = (select auth.uid()));

-- Realtime: deliver inserts/updates to subscribers.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'direct_messages'
  ) then
    alter publication supabase_realtime add table public.direct_messages;
  end if;
end $$;
