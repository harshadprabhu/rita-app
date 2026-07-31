-- =====================================================================
-- RITA — Promotions (Ops Manager gold-rate poster offers)
-- =====================================================================
-- Applied to the live DB already; kept here for reproducibility on fresh
-- installs. A dedicated table, not a `broadcasts` row, because promotions
-- need multiple concurrent active rows (one per store/region), sequential
-- numbering, and an active/inactive lifecycle that "latest wins" can't
-- support. A store can only ever show ONE active promotion at a time — the
-- app enforces that by warning (findOverlappingPromotions) before publish,
-- not with a DB constraint, so the Ops Manager can choose which to deactivate.
-- =====================================================================

create table if not exists promotions (
  id                uuid primary key default gen_random_uuid(),
  seq               bigint generated always as identity, -- shown to the Ops Manager, never on the poster
  sender_id         uuid references profiles(id),
  body              text not null,
  target_store_id   text references stores(id),   -- legacy single-store (mirrors broadcasts)
  target_store_ids  text[],                        -- multi-store/region; [] on both = all stores
  is_active         boolean not null default true,
  activated_at      timestamptz not null default now(),
  deactivated_at    timestamptz,
  created_at        timestamptz not null default now()
);

alter table promotions enable row level security;

drop policy if exists promotions_read on promotions;
create policy promotions_read on promotions for select using (true);

drop policy if exists promotions_write on promotions;
create policy promotions_write on promotions for insert
  with check (current_role_is(array['admin','manager']::user_role[]));

drop policy if exists promotions_update on promotions;
create policy promotions_update on promotions for update
  using (current_role_is(array['admin','manager']::user_role[]))
  with check (current_role_is(array['admin','manager']::user_role[]));
