-- Cold-start keyword seed for categories with (near-)zero historical Sampark
-- tickets, so the auto-classifier (lib/utils/samparkClassifier.ts) can
-- actually match them. Reported case: ticket #63657 "Aurify Camera issue
-- walking are not captured" was auto-filed as Other Issue > Other because
-- ticket_categories.keywords was NULL for CCTV — the classifier has nothing
-- to score against a node with no learned keywords, so it can never win.
--
-- CLAUDE.md's stated policy is "re-run sampark-sync with more pages, not
-- edit keywords by hand" — that's still the right default lever, and it DID
-- work for 5 of these 16 nodes once re-run with pages=100 (10,000 tickets)
-- instead of the daily cron's pages=30. The remaining ones below stayed
-- NULL even at that width: real, near-permanent cold-start categories with
-- too few historical Sampark tickets to ever earn keywords from volume
-- alone. Hand-seeding is the documented exception for exactly this case,
-- not a routine practice — every sampark-sync run OVERWRITES a node's
-- keywords the moment it finds real signal, so these seeds self-heal away
-- the instant genuine ticket volume exists for the category.
--
-- Apply live with:
--   supabase db query --linked < supabase/ticket-categories-coldstart-keywords.sql

update ticket_categories set keywords = array['cctv','camera','aurify','footage','recording','dvr','nvr','walking'] where id = '12734000004019921'; -- CCTV (Facility/Maintanace)
update ticket_categories set keywords = array['light','lighting','tube light','bulb','lamp'] where id = '12734000004019805'; -- Lights (Facility/Maintanace)
update ticket_categories set keywords = array['vpn','remote access','connect','network access'] where id = '12734000000247601'; -- VPN (Security Request)
update ticket_categories set keywords = array['access point','wifi','wireless','network','ap'] where id = '12734000002157051'; -- Access Point (IMAC Request)
update ticket_categories set keywords = array['adobe','pdf','reader','acrobat'] where id = '12734000000247261'; -- Adobe Reader (Software Request)
update ticket_categories set keywords = array['ms project','microsoft project','project plan','gantt'] where id = '12734000000223613'; -- MS Projects (Software Issue)
update ticket_categories set keywords = array['kpi','performance report','dashboard','power bi'] where id = '12734000000253472'; -- KPI (Power BI Issue)
update ticket_categories set keywords = array['far report','fixed asset register','asset report'] where id = '12734000000270153'; -- FAR report (ERP Finance)
update ticket_categories set keywords = array['start of day','sod','opening','day open'] where id = '12734000000252516'; -- Start of the Day (POS Issue)
update ticket_categories set keywords = array['double rate','rate protection','pricing error','duplicate rate'] where id = '12734000005549824'; -- Double Rate Protection (POS Issue)
update ticket_categories set keywords = array['exception','error','override'] where id = '12734000000786419'; -- Exception (POS Issue)
