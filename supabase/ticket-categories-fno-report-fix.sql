-- Ticket #63678 "Scheme is not reflecting in scheme report in FNO" was
-- classified as Data and Reporting - Request > Report (shared via
-- Mail/SFTP) > Other. "FNO" = Finance & Operations, i.e. Microsoft
-- Dynamics 365 F&O — RITA's ERP. The real category for this is
-- ERP Finance > General Ledger > Financial Reports/MIS, but that item's
-- keywords were noise carried over from an unrelated, more frequently
-- ticketed sibling item ("access approve", "multiple modules" — nothing
-- about reports), so the classifier could never route to it correctly.
--
-- Replacing with keywords for what this item actually is: an ERP/D365
-- financial or MIS report showing wrong/missing data.
--
-- Apply live with:
--   supabase db query --linked < supabase/ticket-categories-fno-report-fix.sql

update ticket_categories
set keywords = array[
  'fno','f&o','finance and operations','d365','dynamics','dynamics 365',
  'mis report','financial report','report not reflecting','not reflecting',
  'scheme report','report showing','report data','report incorrect'
]
where id = '12734000000270241'; -- Financial Reports/MIS (ERP Finance > General Ledger)
