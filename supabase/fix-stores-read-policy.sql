-- =====================================================================
-- RITA — FIX: "Store ID was not found" on registration
-- =====================================================================
-- The registration screen looks up a Store ID BEFORE the person has an
-- account (so a bad Store ID is caught before creating a login). But the
-- stores table's read policy required being logged in already -- a
-- chicken-and-egg problem that made every Store ID look "not found" during
-- sign-up, even correct ones like ST-5501.
--
-- HOW TO USE: Supabase → SQL Editor → New query → paste this → Run.
-- Safe to run even if you already applied this — it just replaces the rule.
-- =====================================================================

drop policy if exists "stores: read all" on stores;
create policy "stores: read all" on stores for select using (true);
