-- Ticket #63678 "Scheme is not reflecting in scheme report in FNO" was
-- classified as Data and Reporting - Request > Report (shared via
-- Mail/SFTP) > Other. "FNO" = Finance & Operations, i.e. Microsoft
-- Dynamics 365 F&O — RITA's ERP.
--
-- First attempt routed this to ERP Finance > General Ledger >
-- Financial Reports/MIS, but on review the correct destination is
-- ERP Service > Activity > Other Reports instead. Reverting the first
-- item's keywords back to original (so it doesn't wrongly compete for
-- future FNO/report tickets) and seeding the real destination item,
-- whose own keywords were noise carried over from an unrelated,
-- more frequently ticketed sibling (hallmarking center / vendor
-- upload / item master — nothing about reports).
--
-- Apply live with:
--   supabase db query --linked < supabase/ticket-categories-fno-report-fix.sql

-- Revert Financial Reports/MIS (ERP Finance > General Ledger) to its
-- original keywords — this is not the right destination after all.
update ticket_categories
set keywords = array['modules','access approve','approve multiple','multiple modules','approve','multiple','access']
where id = '12734000000270241';

-- Seed Other Reports (ERP Service > Activity) — the actual destination
-- for FNO/D365 report-not-reflecting tickets.
update ticket_categories
set keywords = array[
  'fno','f&o','finance and operations','d365','dynamics','dynamics 365',
  'report not reflecting','not reflecting','scheme report','report showing',
  'report data','report incorrect','mis report','financial report'
]
where id = '12734000001132529';
