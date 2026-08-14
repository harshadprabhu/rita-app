-- Post-ticket-creation ratings: users rate auto-parse accuracy and
-- ticketing experience after submitting a ticket.

create table if not exists ticket_ratings (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  user_id uuid not null references profiles(id),

  -- Auto-categorization accuracy (1-5): was the suggested category/subcategory/item correct?
  auto_category_accuracy int not null check (auto_category_accuracy between 1 and 5),

  -- Ease of creating the ticket (1-5)
  ease_of_creation int not null check (ease_of_creation between 1 and 5),

  -- Overall ticketing experience (1-5)
  overall_experience int not null check (overall_experience between 1 and 5),

  -- Optional free text
  feedback text,

  created_at timestamptz not null default now()
);

-- One rating per ticket
create unique index if not exists ticket_ratings_ticket_unique on ticket_ratings(ticket_id);

-- RLS
alter table ticket_ratings enable row level security;

drop policy if exists "Users can insert their own rating" on ticket_ratings;
create policy "Users can insert their own rating" on ticket_ratings
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users can view ratings" on ticket_ratings;
create policy "Users can view ratings" on ticket_ratings
  for select using (
    auth.uid() = user_id
    or current_role_is(array['admin','ops_manager','manager']::user_role[])
  );

drop policy if exists "Users can update their own rating" on ticket_ratings;
create policy "Users can update their own rating" on ticket_ratings
  for update using (auth.uid() = user_id);
