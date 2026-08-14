-- POC feedback: in-store user feedback collected during the pilot rollout.
-- Each row = one submission from one user at one store.

create table if not exists poc_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  store_id text not null references stores(id),

  -- Ratings (1-5 stars)
  ease_of_ticket_creation int not null check (ease_of_ticket_creation between 1 and 5),
  ease_of_tracking int not null check (ease_of_tracking between 1 and 5),
  overall_experience int not null check (overall_experience between 1 and 5),
  app_speed_performance int not null check (app_speed_performance between 1 and 5),

  -- Comparison vs WhatsApp (1=much harder, 2=harder, 3=same, 4=easier, 5=much easier)
  vs_whatsapp int not null check (vs_whatsapp between 1 and 5),

  -- Yes/No/Maybe preference
  would_prefer_app text not null check (would_prefer_app in ('yes','no','maybe')),

  -- Checkboxes: which features found useful (stored as text array)
  useful_features text[] not null default '{}',

  -- Would you recommend this app to other stores?
  would_recommend text not null check (would_recommend in ('yes','no','maybe')),

  -- Free text
  liked_most text,
  improvements text,
  additional_feedback text,

  created_at timestamptz not null default now()
);

-- One feedback per user (they can update it but not spam multiple)
create unique index if not exists poc_feedback_user_unique on poc_feedback(user_id);

-- RLS
alter table poc_feedback enable row level security;

drop policy if exists "Users can insert their own feedback" on poc_feedback;
create policy "Users can insert their own feedback" on poc_feedback
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users can view their own feedback" on poc_feedback;
create policy "Users can view their own feedback" on poc_feedback
  for select using (
    auth.uid() = user_id
    or current_role_is(array['admin','ops_manager','manager']::user_role[])
  );

drop policy if exists "Users can update their own feedback" on poc_feedback;
create policy "Users can update their own feedback" on poc_feedback
  for update using (auth.uid() = user_id);
