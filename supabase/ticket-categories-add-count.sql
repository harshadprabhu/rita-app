-- =====================================================================
-- RITA — ticket_categories.ticket_count (real ticket-volume prior)
-- =====================================================================
-- Populated by sampark-sync alongside keywords, recomputed fresh on every
-- run just like keywords are (not cumulative — a wide `pages` sample IS
-- the source of truth each time, matching the existing keyword-learning
-- design). Used by samparkClassifier.ts as a small tie-breaking prior: two
-- categories with similar keyword overlap should favor whichever one is
-- actually common in real Sampark history, rather than treating a rare
-- category and a common one as equally likely.
-- =====================================================================

alter table ticket_categories add column if not exists ticket_count integer not null default 0;
