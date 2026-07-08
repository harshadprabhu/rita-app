-- =====================================================================
-- RITA — Store-tablet (shared kiosk) accounts
-- =====================================================================
-- Store-tablet SSO accounts (NJ_Store Tablets group) are shared devices whose
-- store is derived from the AD login id (lib/auth/session.ts storeFromAdId).
-- They're marked with profiles.designation = 'Store Tablet' and are scoped to
-- their whole store's tickets rather than a single requester's.
--
-- The default "tickets: own read" policy only exposes a user's own tickets, so
-- this policy additionally lets a store-tablet account read every ticket for
-- its store (via the existing current_store_id() helper the manager policy
-- uses). No enum change — the marker rides on the existing designation column.
-- Applied live already; kept for reproducibility.
-- =====================================================================

drop policy if exists "tickets: store tablet read store" on tickets;
create policy "tickets: store tablet read store" on tickets for select
using (
  store_id = current_store_id()
  and exists (
    select 1 from profiles p
    where p.id = auth.uid() and p.designation = 'Store Tablet'
  )
);
