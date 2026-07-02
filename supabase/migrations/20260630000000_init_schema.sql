-- RITA base schema: profiles, stores, tickets, chat, audit logs, departments.

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

create table departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table stores (
  id text primary key, -- e.g. ST-5501
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

-- Append-only audit trail: no UPDATE/DELETE policy is granted to anyone.
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
  sender_id uuid references profiles(id), -- null = RITA bot
  body text not null,
  ticket_id uuid references tickets(id),
  created_at timestamptz not null default now()
);

-- Append-only: no UPDATE/DELETE policy granted.
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
