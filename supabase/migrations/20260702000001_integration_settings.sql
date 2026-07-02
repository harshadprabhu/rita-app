-- =====================================================================
-- Integration settings — admin-managed credentials for external services
-- =====================================================================
-- A single-row config table holding the Gold Rate (Dynamics 365) API
-- credentials and the Microsoft SSO (Azure AD) credentials, editable from
-- the admin app.
--
-- Security model:
--   * RLS is ON with NO policies, so no anon/authenticated client can read
--     or write this table directly — secrets never leave the database over
--     PostgREST. Edge functions use the service-role key, which bypasses RLS.
--   * The admin app reads/writes ONLY through the security-definer RPCs
--     below, which (a) enforce an admin check and (b) never return the raw
--     secret values — only boolean "is set" flags.
-- =====================================================================

create table if not exists integration_settings (
  id smallint primary key default 1,
  -- Gold Rate / Dynamics 365
  d365_client_id      text,
  d365_client_secret  text,
  d365_tenant_id      text,
  d365_resource_url   text not null default 'https://novel.operations.dynamics.com',
  d365_warehouse      text not null default 'NS0001',
  -- Microsoft SSO / Azure AD
  azure_client_id     text,
  azure_client_secret text,
  azure_tenant_url    text,
  azure_enabled       boolean not null default true,
  -- audit
  updated_at          timestamptz not null default now(),
  updated_by          uuid references profiles(id),
  constraint integration_settings_singleton check (id = 1)
);

insert into integration_settings (id) values (1) on conflict (id) do nothing;

alter table integration_settings enable row level security;
-- Intentionally NO policies. Only the service role (edge functions) and the
-- security-definer RPCs below may touch this table.

-- ---------- Admin check helper ----------
create or replace function is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ---------- Read (masked) ----------
-- Returns non-secret fields plus boolean flags telling the UI whether each
-- secret is currently populated. Never returns the secret values themselves.
create or replace function admin_get_integration_settings()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r integration_settings;
begin
  if not is_current_user_admin() then
    raise exception 'Not authorized';
  end if;

  select * into r from integration_settings where id = 1;

  return jsonb_build_object(
    'd365_client_id',          r.d365_client_id,
    'd365_tenant_id',          r.d365_tenant_id,
    'd365_resource_url',       r.d365_resource_url,
    'd365_warehouse',          r.d365_warehouse,
    'd365_client_secret_set',  (r.d365_client_secret is not null and r.d365_client_secret <> ''),
    'azure_client_id',         r.azure_client_id,
    'azure_tenant_url',        r.azure_tenant_url,
    'azure_enabled',           r.azure_enabled,
    'azure_client_secret_set', (r.azure_client_secret is not null and r.azure_client_secret <> ''),
    'updated_at',              r.updated_at
  );
end;
$$;

-- ---------- Write ----------
-- Non-secret fields are overwritten whenever their key is present in the
-- payload. Secret fields are overwritten ONLY when a non-empty value is
-- provided, so leaving a secret input blank preserves the stored value.
create or replace function admin_save_integration_settings(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_current_user_admin() then
    raise exception 'Not authorized';
  end if;

  update integration_settings set
    d365_client_id      = case when p ? 'd365_client_id'    then p->>'d365_client_id'    else d365_client_id    end,
    d365_tenant_id      = case when p ? 'd365_tenant_id'    then p->>'d365_tenant_id'    else d365_tenant_id    end,
    d365_resource_url   = case when p ? 'd365_resource_url' then coalesce(nullif(p->>'d365_resource_url',''), 'https://novel.operations.dynamics.com') else d365_resource_url end,
    d365_warehouse      = case when p ? 'd365_warehouse'    then coalesce(nullif(p->>'d365_warehouse',''), 'NS0001') else d365_warehouse end,
    d365_client_secret  = case when coalesce(p->>'d365_client_secret','')  <> '' then p->>'d365_client_secret'  else d365_client_secret  end,
    azure_client_id     = case when p ? 'azure_client_id'   then p->>'azure_client_id'   else azure_client_id   end,
    azure_tenant_url    = case when p ? 'azure_tenant_url'  then p->>'azure_tenant_url'  else azure_tenant_url  end,
    azure_enabled       = case when p ? 'azure_enabled'     then (p->>'azure_enabled')::boolean else azure_enabled end,
    azure_client_secret = case when coalesce(p->>'azure_client_secret','') <> '' then p->>'azure_client_secret' else azure_client_secret end,
    updated_at          = now(),
    updated_by          = auth.uid()
  where id = 1;

  return admin_get_integration_settings();
end;
$$;

grant execute on function admin_get_integration_settings() to authenticated;
grant execute on function admin_save_integration_settings(jsonb) to authenticated;
grant execute on function is_current_user_admin() to authenticated;
