-- ============================================================================
-- SARWAM — Security hardening (Supabase Security Advisor findings, Oct 2026)
-- Idempotent: safe to re-run.
-- ============================================================================

-- 1) CRITICAL · rls_disabled_in_public — sampark_webhook_hits
-- Webhook debug log (raw Sampark payloads). RLS was off and anon held full
-- grants, so anyone with the public project URL + anon key could read, edit
-- or delete it. Only the sampark-webhook edge function writes it, with the
-- service-role key (which bypasses RLS); the app never reads it.
alter table public.sampark_webhook_hits enable row level security;
revoke all on public.sampark_webhook_hits from anon, authenticated;

-- 2) PII readable without signing in — policies granted to role "public"
-- (which includes anon). workers holds 794 staff names, emails, phone
-- numbers and personnel numbers. The app only reads these tables after
-- Microsoft sign-in, so restricting them to signed-in users changes nothing
-- for real users.
alter policy "workers_read"                on public.workers             to authenticated;
alter policy "stores: read all"            on public.stores              to authenticated;
alter policy "ticket_categories_read"      on public.ticket_categories   to authenticated;
alter policy "promotions_read"             on public.promotions          to authenticated;
alter policy "checklist_templates: read"   on public.checklist_templates to authenticated;
alter policy "checklist_questions: read"   on public.checklist_questions to authenticated;

-- 3) Attachment buckets could be LISTED by anyone — the storage SELECT
-- policies were granted to "public", so the anon key could enumerate and
-- download every ticket photo/video/document. Restrict listing to signed-in
-- users. Files stay reachable through their existing public URLs, so images
-- already shown in the app keep working.
alter policy "ticket files: read"    on storage.objects to authenticated;
alter policy "checklist files: read" on storage.objects to authenticated;

-- 4) WARN · function_search_path_mutable — pin search_path on our functions
-- (7 of the 9 are SECURITY DEFINER, where a mutable search_path is the risky
-- case). Every function body here uses public objects or fully-qualified names.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and p.proname in ('set_updated_at', 'current_role_is', 'current_store_id', 'notify_broadcast_push',
                        'notify_comment_to_sampark', 'submit_checklist', 'set_ticket_resolved_at',
                        'notify_ticket_comment', 'notify_notification_push')
  loop
    execute format('alter function %s set search_path = public, pg_temp', r.sig);
  end loop;
end $$;

-- Not changed, by design:
--  * integration_settings: RLS on with no policies (INFO). Intentional — it holds
--    D365/SSO secrets and is reached only through the admin-checked SECURITY
--    DEFINER RPCs admin_get/save_integration_settings.
--  * pg_net in schema public (WARN extension_in_public): pg_net does not support
--    ALTER EXTENSION ... SET SCHEMA, and its functions live in schema "net"
--    anyway. Moving it means drop/recreate and re-pointing every cron job; low risk.
