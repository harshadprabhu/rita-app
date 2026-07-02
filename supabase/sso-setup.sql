-- =====================================================================
-- RITA — Microsoft SSO: auto-provision a bare profile on first sign-in
-- =====================================================================
-- Microsoft (Azure/Entra ID) sign-in creates a Supabase auth user but has no
-- way to insert a matching row into our own `profiles` table -- there's no
-- client-side code running at that moment. This trigger fills that gap: the
-- moment a NEW auth user shows up whose sign-in method wasn't email/password,
-- it creates a minimal profile (role 'user', no store yet). The app then
-- routes them to /onboarding-store to pick their store on first login.
--
-- Email/password sign-ups are untouched -- app/(auth)/register.tsx already
-- inserts a complete profile row itself right after signUp(), so this
-- trigger explicitly skips the 'email' provider to avoid inserting twice.
--
-- HOW TO USE: Supabase → SQL Editor → New query → paste this → Run.
-- =====================================================================

create or replace function handle_new_sso_user() returns trigger as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  guessed_name text := coalesce(
    nullif(meta->>'name', ''),
    nullif(meta->>'full_name', ''),
    split_part(new.email, '@', 1)
  );
  first text := coalesce(nullif(meta->>'given_name', ''), split_part(guessed_name, ' ', 1));
  last text := coalesce(
    nullif(meta->>'family_name', ''),
    nullif(trim(substr(guessed_name, length(first) + 1)), ''),
    'User'
  );
begin
  if new.raw_app_meta_data->>'provider' = 'email' then
    return new;
  end if;

  insert into profiles (id, first_name, last_name, role, approval_status, is_active)
  values (new.id, first, last, 'user', 'approved', true)
  on conflict (id) do nothing;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created_sso on auth.users;
create trigger on_auth_user_created_sso
  after insert on auth.users
  for each row execute function handle_new_sso_user();
