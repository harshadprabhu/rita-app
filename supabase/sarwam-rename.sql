-- ============================================================================
-- SARWAM — product rename: strip the old product name from live DB objects/data
-- Idempotent: safe to re-run.
-- ============================================================================

-- Technician roster: matched-account column + its index.
do $$ begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'sampark_technicians' and column_name = 'rita_profile_id') then
    alter table public.sampark_technicians rename column rita_profile_id to sarwam_profile_id;
  end if;
end $$;
alter index if exists public.idx_sampark_tech_rita rename to idx_sampark_tech_sarwam;

-- Fallback ticket number prefix (display uses the Sampark number; this is only the internal default).
alter table public.tickets
  alter column ticket_number set default ('SARWAM-' || nextval('ticket_number_seq')::text);
update public.tickets set ticket_number = 'SARWAM-' || substr(ticket_number, 6)
  where ticket_number like 'RITA-%';

comment on column public.tickets.sampark_technician_name is
  'Technician name as returned by Sampark API — source of truth for assignment display when technicians don''t use the SARWAM app.';

-- Rewrite any function body still carrying the old name (comments only today).
do $$
declare r record; def text;
begin
  for r in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and pg_get_functiondef(p.oid) ~ 'RITA' loop
    def := regexp_replace(pg_get_functiondef(r.oid), '\mRITA\M', 'SARWAM', 'g');
    execute def;
  end loop;
end $$;

-- Stored text: notification copy and synced note author tags.
update public.notifications
  set title = regexp_replace(title, '\mRITA\M', 'SARWAM', 'g'),
      body  = regexp_replace(body,  '\mRITA\M', 'SARWAM', 'g')
  where title ~ '\mRITA\M' or body ~ '\mRITA\M';
update public.ticket_comments
  set body = replace(body, '(RITA)', '(SARWAM)'),
      external_author = replace(external_author, '(RITA)', '(SARWAM)')
  where body like '%(RITA)%' or external_author like '%(RITA)%';
