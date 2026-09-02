-- Push a notification (which the existing notification_push trigger turns
-- into an OS push via send-push → FCM) whenever a new comment lands on a
-- ticket, so the requester + assignee are alerted like a WhatsApp message.
--
-- Skips:
--  - Notifying the author of their own comment (they see it locally already)
--  - Internal notes (staff-only; requester must not see them)
-- Sampark-mirrored comments (author_id null, external_author set) DO ping —
-- that's the whole point: when a technician replies from Sampark's side,
-- the requester on their phone should be notified like a WhatsApp message.

create or replace function public.notify_ticket_comment() returns trigger
language plpgsql
security definer
as $$
declare
  v_requester_id uuid;
  v_assignee_id  uuid;
  v_display_id   text;
  v_ticket_num   text;
  v_author_name  text;
  v_body_snippet text;
  v_title        text;
begin
  -- Internal notes never notify the requester (only staff see them).
  if new.is_internal then
    return new;
  end if;

  select t.requester_id, t.assignee_id,
         coalesce(t.sampark_display_id, t.ticket_number)
    into v_requester_id, v_assignee_id, v_display_id
  from public.tickets t
  where t.id = new.ticket_id;

  -- Author name: RITA profile when the comment was written in-app, otherwise
  -- the Sampark-side name preserved on the comment row itself.
  if new.author_id is not null then
    select coalesce(p.display_name, 'Someone')
      into v_author_name
    from public.profiles p
    where p.id = new.author_id;
  else
    v_author_name := coalesce(nullif(new.external_author, ''), 'Support');
  end if;

  v_ticket_num := coalesce(nullif(v_display_id, ''), 'ticket');
  -- Trim the body to something readable in a notification banner (WhatsApp's
  -- own limit is ~65 chars; we go a bit higher and let the OS ellipsize).
  v_body_snippet := substring(coalesce(new.body, '') from 1 for 140);
  v_title := v_author_name || ' commented on #' || v_ticket_num;

  -- Fan out to requester + assignee, excluding the author (if any) from
  -- being pinged for their own message. A distinct-CTE dedupes when
  -- requester == assignee. When author_id is null (Sampark-mirrored),
  -- both recipients are eligible.
  insert into public.notifications (recipient_id, ticket_id, title, body, type)
  select distinct r.recipient_id, new.ticket_id, v_title, v_body_snippet, 'ticket_comment'::notification_type
  from (
    select v_requester_id as recipient_id
      where v_requester_id is not null
        and (new.author_id is null or v_requester_id <> new.author_id)
    union
    select v_assignee_id as recipient_id
      where v_assignee_id is not null
        and (new.author_id is null or v_assignee_id <> new.author_id)
  ) r
  where r.recipient_id is not null;

  return new;
end;
$$;

drop trigger if exists ticket_comment_notify on public.ticket_comments;
create trigger ticket_comment_notify
  after insert on public.ticket_comments
  for each row execute function public.notify_ticket_comment();
