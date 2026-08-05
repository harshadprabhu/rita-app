-- =====================================================================
-- RITA — Saksham Daily Store Checklists
-- =====================================================================
-- Digital version of the paper/Excel "Saksham Checklist" — 4 fixed daily
-- checklists (Store Opening, Store Closing, SM Checklist, SCM Checklist)
-- filled by in-store managers, scored, and reviewable by Ops Managers
-- across stores. Applied live; kept here for reproducibility, following
-- the same pattern as promotions-setup.sql.
--
-- Role note: policies below check 'in_store_manager'/'ops_manager' EXPLICITLY,
-- not via current_role_is's in_store_manager->user aliasing — that alias
-- exists so EXISTING user-scoped policies keep working for both roles; using
-- it here would also let plain 'user' accounts submit/read checklists, which
-- is wrong for a feature scoped specifically to in_store_manager.
-- =====================================================================

do $$ begin
  create type checklist_template_key as enum
    ('store_opening', 'store_closing', 'sm_checklist', 'scm_checklist');
exception when duplicate_object then null;
end $$;

-- Reused by the daily reminder cron (checklists-reminder-cron.sql) — a
-- notification riding the existing notification_push trigger.
alter type notification_type add value if not exists 'checklist_reminder';

create table if not exists checklist_templates (
  id         uuid primary key default gen_random_uuid(),
  key        checklist_template_key not null unique,
  name       text not null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists checklist_questions (
  id                    uuid primary key default gen_random_uuid(),
  template_id           uuid not null references checklist_templates(id) on delete cascade,
  seq                   int not null,                -- Question No / sheet order
  point_of_observation  text not null,
  question_type         text not null default 'yes_no_na' check (question_type in ('yes_no_na', 'numeric')),
  score_if_yes          int,                          -- null for numeric / not-scored rows
  score_if_no           int,
  score_if_na           int,
  is_scored             boolean not null default true, -- false = "Not Scored" rows
  requires_photo        boolean not null default false,
  cadence               text not null default 'daily' check (cadence in ('daily', 'weekly')),
  cadence_note          text,                          -- e.g. "Tuesdays only"
  created_at            timestamptz not null default now(),
  unique (template_id, seq)
);

create table if not exists checklist_submissions (
  id              uuid primary key default gen_random_uuid(),
  template_id     uuid not null references checklist_templates(id),
  store_id        text not null references stores(id),
  submitted_by    uuid not null references profiles(id),
  submission_date date not null default ((now() at time zone 'Asia/Kolkata')::date),
  status          text not null default 'in_progress' check (status in ('in_progress', 'submitted')),
  total_score     numeric,   -- null until submitted
  passed          boolean,   -- null until submitted
  submitted_at    timestamptz,
  created_at      timestamptz not null default now(),
  unique (template_id, store_id, submission_date)
);

create table if not exists checklist_answers (
  id             uuid primary key default gen_random_uuid(),
  submission_id  uuid not null references checklist_submissions(id) on delete cascade,
  question_id    uuid not null references checklist_questions(id),
  answer_value   text,       -- 'yes' | 'no' | 'na' | numeric-as-text
  photo_path     text,       -- storage path in the checklist-attachments bucket
  resolved_score int,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (submission_id, question_id)
);

alter table checklist_templates enable row level security;
alter table checklist_questions enable row level security;
alter table checklist_submissions enable row level security;
alter table checklist_answers enable row level security;

-- ---------- templates / questions: reference data ----------

drop policy if exists "checklist_templates: read" on checklist_templates;
create policy "checklist_templates: read" on checklist_templates for select using (true);

drop policy if exists "checklist_templates: admin write" on checklist_templates;
create policy "checklist_templates: admin write" on checklist_templates for all
  using (current_role_is(array['admin']::user_role[]))
  with check (current_role_is(array['admin']::user_role[]));

drop policy if exists "checklist_questions: read" on checklist_questions;
create policy "checklist_questions: read" on checklist_questions for select using (true);

drop policy if exists "checklist_questions: admin write" on checklist_questions;
create policy "checklist_questions: admin write" on checklist_questions for all
  using (current_role_is(array['admin']::user_role[]))
  with check (current_role_is(array['admin']::user_role[]));

-- ---------- submissions ----------

drop policy if exists "checklist_submissions: isr write own store" on checklist_submissions;
create policy "checklist_submissions: isr write own store" on checklist_submissions for insert
  with check (
    current_role_is(array['in_store_manager', 'admin']::user_role[])
    and store_id = current_store_id()
  );

drop policy if exists "checklist_submissions: isr update own store" on checklist_submissions;
create policy "checklist_submissions: isr update own store" on checklist_submissions for update
  using (
    current_role_is(array['in_store_manager', 'admin']::user_role[])
    and store_id = current_store_id()
  )
  with check (
    current_role_is(array['in_store_manager', 'admin']::user_role[])
    and store_id = current_store_id()
  );

drop policy if exists "checklist_submissions: isr read own store" on checklist_submissions;
create policy "checklist_submissions: isr read own store" on checklist_submissions for select
  using (
    current_role_is(array['in_store_manager']::user_role[])
    and store_id = current_store_id()
  );

drop policy if exists "checklist_submissions: ops read all" on checklist_submissions;
create policy "checklist_submissions: ops read all" on checklist_submissions for select
  using (current_role_is(array['ops_manager', 'admin']::user_role[]));

-- ---------- answers (scoped via parent submission's store) ----------

drop policy if exists "checklist_answers: isr write own submission" on checklist_answers;
create policy "checklist_answers: isr write own submission" on checklist_answers for insert
  with check (
    current_role_is(array['in_store_manager', 'admin']::user_role[])
    and exists (
      select 1 from checklist_submissions s
      where s.id = submission_id and s.store_id = current_store_id()
    )
  );

drop policy if exists "checklist_answers: isr update own submission" on checklist_answers;
create policy "checklist_answers: isr update own submission" on checklist_answers for update
  using (
    current_role_is(array['in_store_manager', 'admin']::user_role[])
    and exists (
      select 1 from checklist_submissions s
      where s.id = submission_id and s.store_id = current_store_id()
    )
  )
  with check (
    current_role_is(array['in_store_manager', 'admin']::user_role[])
    and exists (
      select 1 from checklist_submissions s
      where s.id = submission_id and s.store_id = current_store_id()
    )
  );

drop policy if exists "checklist_answers: isr read own submission" on checklist_answers;
create policy "checklist_answers: isr read own submission" on checklist_answers for select
  using (
    current_role_is(array['in_store_manager']::user_role[])
    and exists (
      select 1 from checklist_submissions s
      where s.id = submission_id and s.store_id = current_store_id()
    )
  );

drop policy if exists "checklist_answers: ops read all" on checklist_answers;
create policy "checklist_answers: ops read all" on checklist_answers for select
  using (current_role_is(array['ops_manager', 'admin']::user_role[]));

-- ---------- scoring RPC ----------
-- Resolves each answer's score from its question's score_if_yes/no/na +
-- is_scored flag, then averages over scored/non-NA answers. Kept server-side
-- (not computed client-side) so the score Ops Managers judge stores by can't
-- be altered by a stale/buggy app build, and stays a single source of truth.

create or replace function submit_checklist(p_submission_id uuid)
returns table (total_score numeric, passed boolean) as $$
declare
  v_store_id text;
  v_avg numeric;
begin
  select store_id into v_store_id from checklist_submissions where id = p_submission_id;
  if v_store_id is null then
    raise exception 'submission not found';
  end if;
  if v_store_id <> current_store_id() and not current_role_is(array['admin']::user_role[]) then
    raise exception 'not authorized for this store';
  end if;

  -- Resolve each answer's score from its question definition.
  update checklist_answers a
  set resolved_score = case
        when q.is_scored = false then null
        when a.answer_value = 'yes' then q.score_if_yes
        when a.answer_value = 'no' then q.score_if_no
        when a.answer_value = 'na' then q.score_if_na
        else null
      end,
      updated_at = now()
  from checklist_questions q
  where a.question_id = q.id and a.submission_id = p_submission_id;

  -- Average over scored, non-NA answers only.
  select avg(a.resolved_score) into v_avg
  from checklist_answers a
  join checklist_questions q on q.id = a.question_id
  where a.submission_id = p_submission_id
    and q.is_scored = true
    and a.answer_value <> 'na';

  update checklist_submissions
  set status = 'submitted',
      submitted_at = now(),
      total_score = v_avg,
      passed = (v_avg is not null and v_avg >= 50)
  where id = p_submission_id;

  return query select cs.total_score, cs.passed from checklist_submissions cs where cs.id = p_submission_id;
end;
$$ language plpgsql security definer;
