-- Fix: creating a RITA bot chat channel returned 403.
-- The chat_channels SELECT policy only allows reading a channel you already
-- participate in (or a group in your store). Inserting a bot channel and
-- reading it back via RETURNING failed RLS because the participant row didn't
-- exist yet — a chicken-and-egg. This security-definer RPC creates the channel
-- and the participant atomically, then returns the channel.

create or replace function create_bot_channel()
returns chat_channels
language plpgsql
security definer
set search_path = public
as $$
declare
  ch chat_channels;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  -- Reuse an existing bot channel for this user if one already exists.
  select c.* into ch
  from chat_channels c
  join chat_participants p on p.channel_id = c.id
  where c.type = 'bot' and p.profile_id = auth.uid()
  limit 1;
  if found then
    return ch;
  end if;

  insert into chat_channels (type, store_id) values ('bot', null) returning * into ch;
  insert into chat_participants (channel_id, profile_id) values (ch.id, auth.uid());
  return ch;
end;
$$;

grant execute on function create_bot_channel() to authenticated;
