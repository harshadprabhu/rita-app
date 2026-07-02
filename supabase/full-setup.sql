-- =====================================================================
-- RITA — ONE-CLICK BACKEND SETUP
-- =====================================================================
-- HOW TO USE: open your Supabase project → SQL Editor → New query →
-- paste this ENTIRE file → click "Run". That's it. It creates every table,
-- all security rules, the file-storage bucket, and a few demo stores.
-- Safe to run once on a brand-new project.
-- =====================================================================

-- ---------- 1. TYPES ----------
create type user_role as enum ('user', 'manager', 'technician', 'admin');
create type approval_status as enum ('pending', 'approved', 'rejected');
create type ticket_status as enum ('open', 'in_progress', 'resolved');
create type ticket_lifecycle as enum ('open', 'being_worked_on', 'pending_your_action', 'escalated', 'resolved', 'closed');
create type ticket_priority as enum ('low', 'medium', 'high', 'critical');
create type ticket_source as enum ('form', 'chat_bot');
create type notification_type as enum (
  'ticket_created', 'ticket_updated', 'ticket_assigned', 'ticket_resolved',
  'ticket_comment', 'sla_breach', 'broadcast'
);
create type chat_channel_type as enum ('group', 'dm', 'bot');
create type account_action as enum ('provisioned', 'updated', 'activated', 'deactivated');

-- ---------- 2. TABLES ----------
create table departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table stores (
  id text primary key,
  code text not null unique,
  name text not null,
  city text,
  region text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  store_id text references stores(id),
  store_name text,
  store_location text,
  first_name text not null,
  last_name text not null,
  display_name text generated always as (first_name || ' ' || last_name) stored,
  phone text,
  designation text,
  role user_role not null default 'user',
  approval_status approval_status not null default 'pending',
  is_active boolean not null default true,
  expo_push_token text,
  created_at timestamptz not null default now(),
  constraint store_id_uppercase check (store_id is null or store_id = upper(store_id))
);

create sequence ticket_number_seq start 1001;

create table tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number text not null unique default ('RITA-' || nextval('ticket_number_seq')::text),
  requester_id uuid not null references profiles(id),
  assignee_id uuid references profiles(id),
  department_id uuid references departments(id),
  store_id text not null references stores(id),
  description text not null,
  long_description text,
  status ticket_status not null default 'open',
  lifecycle ticket_lifecycle not null default 'open',
  priority ticket_priority not null default 'medium',
  category text,
  subcategory text,
  resolution text,
  resolved_at timestamptz,
  source ticket_source not null default 'form',
  sla_due_at timestamptz,
  sla_breached boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table ticket_attachments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  storage_path text not null,
  file_name text,
  file_type text check (file_type in ('image', 'video', 'document')),
  created_at timestamptz not null default now()
);

create table ticket_comments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  author_id uuid not null references profiles(id),
  body text not null,
  is_internal boolean not null default false,
  created_at timestamptz not null default now()
);

create table ticket_audit_log (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  actor_id uuid references profiles(id),
  action text not null,
  from_value text,
  to_value text,
  created_at timestamptz not null default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references profiles(id),
  ticket_id uuid references tickets(id),
  title text not null,
  body text,
  type notification_type,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table broadcasts (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references profiles(id),
  target_store_id text references stores(id),
  target_store_ids text[],
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table chat_channels (
  id uuid primary key default gen_random_uuid(),
  type chat_channel_type not null,
  store_id text references stores(id),
  created_at timestamptz not null default now()
);

create table chat_participants (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references chat_channels(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (channel_id, profile_id)
);

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references chat_channels(id) on delete cascade,
  sender_id uuid references profiles(id),
  body text not null,
  ticket_id uuid references tickets(id),
  created_at timestamptz not null default now()
);

create table account_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(id),
  target_profile_id uuid not null references profiles(id),
  action account_action not null,
  details text,
  created_at timestamptz not null default now()
);

create index idx_tickets_store on tickets(store_id);
create index idx_tickets_assignee on tickets(assignee_id);
create index idx_tickets_sla_breached on tickets(sla_breached) where sla_breached = true;
create index idx_chat_messages_channel on chat_messages(channel_id, created_at);
create index idx_notifications_recipient on notifications(recipient_id, is_read);

create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger tickets_set_updated_at
  before update on tickets
  for each row execute function set_updated_at();

-- ---------- 3. DEMO STORES + DEPARTMENT ----------
-- When people sign up, they use one of these Store IDs (e.g. ST-5501).
-- Add more later in Supabase → Table editor → stores.
insert into stores (id, code, name, city, region) values
  ('ST-5501', 'ST-5501', 'Indriya Bandra', 'Mumbai', 'West'),
  ('ST-5502', 'ST-5502', 'Indriya Andheri', 'Mumbai', 'West'),
  ('ST-5601', 'ST-5601', 'Indriya Koramangala', 'Bengaluru', 'South')
on conflict (id) do nothing;

insert into departments (name) values ('IT Support'), ('Facilities')
on conflict (name) do nothing;

-- ---------- 4. SECURITY (Row Level Security) ----------
alter table profiles enable row level security;
alter table stores enable row level security;
alter table departments enable row level security;
alter table tickets enable row level security;
alter table ticket_attachments enable row level security;
alter table ticket_comments enable row level security;
alter table ticket_audit_log enable row level security;
alter table notifications enable row level security;
alter table broadcasts enable row level security;
alter table chat_channels enable row level security;
alter table chat_participants enable row level security;
alter table chat_messages enable row level security;
alter table account_audit_log enable row level security;

create or replace function current_role_is(roles user_role[]) returns boolean as $$
  select exists (select 1 from profiles where id = auth.uid() and role = any(roles));
$$ language sql security definer stable;

create or replace function current_store_id() returns text as $$
  select store_id from profiles where id = auth.uid();
$$ language sql security definer stable;

-- profiles
create policy "profiles: self read" on profiles for select using (id = auth.uid());
create policy "profiles: staff read all" on profiles for select using (current_role_is(array['admin','manager','technician']::user_role[]));
create policy "profiles: self insert" on profiles for insert with check (id = auth.uid());
create policy "profiles: self update" on profiles for update using (id = auth.uid());
create policy "profiles: admin manage" on profiles for all using (current_role_is(array['admin']::user_role[]));

-- stores / departments
-- Publicly readable (not just to logged-in users): the registration screen
-- looks up a Store ID BEFORE the person has an account, so this must work for
-- anonymous requests too, or every new sign-up would fail to find any store.
create policy "stores: read all" on stores for select using (true);
create policy "stores: admin write" on stores for all using (current_role_is(array['admin']::user_role[]));
create policy "departments: read all" on departments for select using (auth.uid() is not null);
create policy "departments: admin write" on departments for all using (current_role_is(array['admin']::user_role[]));

-- tickets
create policy "tickets: own read" on tickets for select using (requester_id = auth.uid());
create policy "tickets: staff read all" on tickets for select using (current_role_is(array['admin','technician']::user_role[]));
create policy "tickets: manager read store" on tickets for select using (current_role_is(array['manager']::user_role[]) and store_id = current_store_id());
create policy "tickets: own insert" on tickets for insert with check (requester_id = auth.uid());
create policy "tickets: staff update" on tickets for update using (current_role_is(array['admin','technician']::user_role[]));
create policy "tickets: manager update store" on tickets for update using (current_role_is(array['manager']::user_role[]) and store_id = current_store_id());

-- ticket_attachments
create policy "attachments: read via ticket" on ticket_attachments for select using (
  exists (select 1 from tickets t where t.id = ticket_id and (
    t.requester_id = auth.uid()
    or current_role_is(array['admin','technician']::user_role[])
    or (current_role_is(array['manager']::user_role[]) and t.store_id = current_store_id())
  ))
);
create policy "attachments: insert via ticket" on ticket_attachments for insert with check (
  exists (select 1 from tickets t where t.id = ticket_id and t.requester_id = auth.uid())
  or current_role_is(array['admin','technician']::user_role[])
);

-- ticket_comments
create policy "comments: read non-internal or staff" on ticket_comments for select using (
  not is_internal or current_role_is(array['admin','technician','manager']::user_role[])
);
create policy "comments: insert own" on ticket_comments for insert with check (author_id = auth.uid());

-- ticket_audit_log (append-only)
create policy "audit: read via ticket" on ticket_audit_log for select using (
  exists (select 1 from tickets t where t.id = ticket_id and (
    t.requester_id = auth.uid() or current_role_is(array['admin','technician','manager']::user_role[])
  ))
);
create policy "audit: insert" on ticket_audit_log for insert with check (auth.uid() is not null);

-- notifications
create policy "notifications: own read" on notifications for select using (recipient_id = auth.uid());
create policy "notifications: own update" on notifications for update using (recipient_id = auth.uid());
create policy "notifications: insert any" on notifications for insert with check (auth.uid() is not null);

-- broadcasts
create policy "broadcasts: read all" on broadcasts for select using (auth.uid() is not null);
create policy "broadcasts: staff insert" on broadcasts for insert with check (current_role_is(array['admin','technician']::user_role[]));

-- chat
create policy "chat_channels: read if participant or group in own store" on chat_channels for select using (
  exists (select 1 from chat_participants p where p.channel_id = id and p.profile_id = auth.uid())
  or (type = 'group' and store_id = current_store_id())
);
create policy "chat_channels: insert own" on chat_channels for insert with check (auth.uid() is not null);
create policy "chat_participants: read own" on chat_participants for select using (profile_id = auth.uid());
create policy "chat_participants: insert own" on chat_participants for insert with check (profile_id = auth.uid());
create policy "chat_messages: read" on chat_messages for select using (
  exists (select 1 from chat_channels c where c.id = channel_id and (
    exists (select 1 from chat_participants p where p.channel_id = c.id and p.profile_id = auth.uid())
    or (c.type = 'group' and c.store_id = current_store_id())
  ))
);
create policy "chat_messages: insert" on chat_messages for insert with check (
  exists (select 1 from chat_channels c where c.id = channel_id and (
    exists (select 1 from chat_participants p where p.channel_id = c.id and p.profile_id = auth.uid())
    or (c.type = 'group' and c.store_id = current_store_id())
  ))
);

-- account_audit_log
create policy "account_audit: admin read" on account_audit_log for select using (current_role_is(array['admin']::user_role[]));
create policy "account_audit: admin insert" on account_audit_log for insert with check (current_role_is(array['admin']::user_role[]));

-- ---------- 6. MICROSOFT SSO: auto-provision a bare profile on first sign-in ----------
-- Azure/Entra ID sign-in creates a Supabase auth user with no matching profiles
-- row (there's no client-side code running at that moment to insert one). This
-- trigger fills that gap for any non-email sign-in method; the app then routes
-- the person to /onboarding-store to pick their store on first login. Regular
-- email/password sign-ups are untouched (the app inserts their profile itself).
create or replace function handle_new_sso_user() returns trigger as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  guessed_name text := coalesce(
    nullif(meta->>'name', ''),
    nullif(meta->>'full_name', ''),
    split_part(new.email, '@', 1)
  );
  first text := coalesce(nullif(meta->>'given_name', ''), split_part(guessed_name, ' ', 1));
  last text := coalesce(
    nullif(meta->>'family_name', ''),
    nullif(trim(substr(guessed_name, length(first) + 1)), ''),
    'User'
  );
begin
  if new.raw_app_meta_data->>'provider' = 'email' then
    return new;
  end if;

  insert into profiles (id, first_name, last_name, role, approval_status, is_active)
  values (new.id, first, last, 'user', 'approved', true)
  on conflict (id) do nothing;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created_sso on auth.users;
create trigger on_auth_user_created_sso
  after insert on auth.users
  for each row execute function handle_new_sso_user();

-- =====================================================================
-- DONE. Next: enable Email auth, deploy the web app, then run the
-- "make me admin" snippet from HOSTING-GUIDE.md after your first sign-up.
-- (Photo attachments are optional — see supabase/storage-setup.sql.)
-- (Microsoft SSO also needs an Azure app registration configured in
-- Supabase → Authentication → Providers — see HOSTING-GUIDE.md Part D.)
-- =====================================================================
