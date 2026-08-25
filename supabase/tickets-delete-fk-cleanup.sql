-- Two FK constraints reference tickets(id) WITHOUT an ON DELETE clause, so
-- when an admin/technician tries to delete a ticket that already has any
-- notifications (which every ticket now does, since createTicket fans out
-- notifications to store users) or chat messages, Postgres blocks the
-- delete with a foreign_key_violation. Effect for the user: "Delete does
-- nothing" — or, with the client hardening, a scary FK error alert.
--
-- Fix: switch both to ON DELETE SET NULL. A notification/message can
-- outlive the ticket it referenced; nulling the id preserves the message
-- content and its read-state instead of cascading history away.
--
-- Apply live with:
--   supabase db query --linked < supabase/tickets-delete-fk-cleanup.sql

-- notifications.ticket_id
alter table notifications drop constraint if exists notifications_ticket_id_fkey;
alter table notifications
  add constraint notifications_ticket_id_fkey
  foreign key (ticket_id) references tickets(id) on delete set null;

-- chat_messages.ticket_id
alter table chat_messages drop constraint if exists chat_messages_ticket_id_fkey;
alter table chat_messages
  add constraint chat_messages_ticket_id_fkey
  foreign key (ticket_id) references tickets(id) on delete set null;
