-- =====================================================================
-- RITA — RLS performance fix: hoist auth.uid() out of per-row evaluation
-- =====================================================================
-- current_role_is/current_store_id are marked STABLE, but that alone does
-- NOT make Postgres cache their result once per statement inside an RLS
-- USING/WITH CHECK expression — a bare `auth.uid()` call gets re-evaluated
-- (re-running the `select ... from profiles where id = auth.uid()`
-- subquery) once per row scanned. Wrapping it as `(select auth.uid())`
-- lets the planner hoist it into a single InitPlan executed once per
-- statement instead. This is the standard, documented Supabase RLS
-- performance fix — semantically identical, pure query-plan improvement.
--
-- Several policies (e.g. "attachments: read via ticket") call these
-- functions 2-3 times per row, so this compounds on any list/detail fetch
-- that joins a table with more than a couple of RLS-gated rows.
--
-- Applied live; kept here for reproducibility.
-- =====================================================================

create or replace function current_role_is(roles user_role[]) returns boolean as $$
  select exists (
    select 1 from profiles
    where id = (select auth.uid())
    and (
      role = any(roles)
      or (role = 'ops_manager'::user_role      and 'manager'::user_role = any(roles))
      or (role = 'in_store_manager'::user_role and 'user'::user_role    = any(roles))
    )
  );
$$ language sql security definer stable;

create or replace function current_store_id() returns text as $$
  select store_id from profiles where id = (select auth.uid());
$$ language sql security definer stable;
