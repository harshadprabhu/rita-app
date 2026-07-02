-- Row Level Security for RITA. Mirrors lib/auth/permissions.ts.

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
  select exists (
    select 1 from profiles where id = auth.uid() and role = any(roles)
  );
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

-- stores (read-only for all authenticated users)
create policy "stores: read all" on stores for select using (auth.uid() is not null);
create policy "stores: admin write" on stores for all using (current_role_is(array['admin']::user_role[]));

-- departments
create policy "departments: read all" on departments for select using (auth.uid() is not null);
create policy "departments: admin write" on departments for all using (current_role_is(array['admin']::user_role[]));

-- tickets
create policy "tickets: own read" on tickets for select using (requester_id = auth.uid());
create policy "tickets: staff read all" on tickets for select using (current_role_is(array['admin','technician']::user_role[]));
create policy "tickets: manager read store" on tickets for select using (
  current_role_is(array['manager']::user_role[]) and store_id = current_store_id()
);
create policy "tickets: own insert" on tickets for insert with check (requester_id = auth.uid());
create policy "tickets: staff update" on tickets for update using (current_role_is(array['admin','technician']::user_role[]));
create policy "tickets: manager update store" on tickets for update using (
  current_role_is(array['manager']::user_role[]) and store_id = current_store_id()
);

-- ticket_attachments (inherit visibility from parent ticket)
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
  not is_internal
  or current_role_is(array['admin','technician','manager']::user_role[])
);
create policy "comments: insert own" on ticket_comments for insert with check (author_id = auth.uid());

-- ticket_audit_log: insert-only, no update/delete policy exists (immutable by omission)
create policy "audit: read via ticket" on ticket_audit_log for select using (
  exists (select 1 from tickets t where t.id = ticket_id and (
    t.requester_id = auth.uid()
    or current_role_is(array['admin','technician','manager']::user_role[])
  ))
);
create policy "audit: insert" on ticket_audit_log for insert with check (auth.uid() is not null);

-- notifications
create policy "notifications: own read" on notifications for select using (recipient_id = auth.uid());
create policy "notifications: own update" on notifications for update using (recipient_id = auth.uid());
create policy "notifications: insert any" on notifications for insert with check (auth.uid() is not null);

-- broadcasts (store-scoped read, staff write)
create policy "broadcasts: read all" on broadcasts for select using (auth.uid() is not null);
create policy "broadcasts: staff insert" on broadcasts for insert with check (current_role_is(array['admin','technician']::user_role[]));

-- chat_channels / participants / messages
create policy "chat_channels: read if participant or group in own store" on chat_channels for select using (
  exists (select 1 from chat_participants p where p.channel_id = id and p.profile_id = auth.uid())
  or (type = 'group' and store_id = current_store_id())
);
create policy "chat_channels: insert own" on chat_channels for insert with check (auth.uid() is not null);

create policy "chat_participants: read own" on chat_participants for select using (profile_id = auth.uid());
create policy "chat_participants: insert own" on chat_participants for insert with check (profile_id = auth.uid());

create policy "chat_messages: read if participant or group in own store" on chat_messages for select using (
  exists (
    select 1 from chat_channels c
    where c.id = channel_id and (
      exists (select 1 from chat_participants p where p.channel_id = c.id and p.profile_id = auth.uid())
      or (c.type = 'group' and c.store_id = current_store_id())
    )
  )
);
create policy "chat_messages: insert if participant or group in own store" on chat_messages for insert with check (
  exists (
    select 1 from chat_channels c
    where c.id = channel_id and (
      exists (select 1 from chat_participants p where p.channel_id = c.id and p.profile_id = auth.uid())
      or (c.type = 'group' and c.store_id = current_store_id())
    )
  )
);

-- account_audit_log: insert-only, admin read
create policy "account_audit: admin read" on account_audit_log for select using (current_role_is(array['admin']::user_role[]));
create policy "account_audit: admin insert" on account_audit_log for insert with check (current_role_is(array['admin']::user_role[]));
