-- With chat moved to Sampark as the sole source of truth:
--   - RITA no longer writes new ticket_comments rows from the app (the
--     add-comment path posts directly to Sampark via the sampark-notes edge
--     function; the reply thread is read live from Sampark on every screen
--     open).
--   - sampark-webhook + sampark-poll no longer insert notes into
--     ticket_comments either (they insert notifications rows directly for
--     the OS push).
-- So the two triggers that fired on ticket_comments inserts have nothing
-- meaningful to do anymore; keep the table for historical rows but stop
-- the triggers. The table itself is retained (no drop) in case an operator
-- needs the audit trail of pre-migration chats.

drop trigger if exists ticket_comment_notify on public.ticket_comments;
drop trigger if exists comment_to_sampark   on public.ticket_comments;
