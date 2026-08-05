-- =====================================================================
-- RITA -- Saksham checklist seed data
-- =====================================================================
-- One-time load of the 4 templates + their questions, transcribed from the
-- Saksham Checklist Questionnaire workbook. SM Checklist's non-question rows
-- (sign-off reminders + Daily/Weekly cadence legend) are intentionally NOT
-- seeded here -- shown as static reference text in the app instead.
--
-- Safe to re-run: clears and reloads checklist_questions (no real
-- submissions reference these rows yet, this is pre-launch seed data).
-- =====================================================================

delete from checklist_questions;

insert into checklist_templates (key, name) values
  ('store_opening', 'Store Opening Checklist'),
  ('store_closing', 'Store Closing Checklist'),
  ('sm_checklist', 'SM Checklist'),
  ('scm_checklist', 'SCM Checklist')
on conflict (key) do nothing;

insert into checklist_questions (
  template_id, seq, point_of_observation, question_type,
  score_if_yes, score_if_no, score_if_na, is_scored, requires_photo, cadence, cadence_note
)
select t.id, v.seq, v.point_of_observation, v.question_type,
       v.score_if_yes, v.score_if_no, v.score_if_na, v.is_scored, v.requires_photo, v.cadence, v.cadence_note
from (values
  ('store_opening', 1, 'Are lock-seals and entrance locks intact?', 'yes_no_na', 100, 0, 100, true, true, 'daily', null),
  ('store_opening', 2, 'Have you checked for signs of burglary or tampering (counters, Panel Room, BOH door)?', 'yes_no_na', 100, 0, 100, true, false, 'daily', null),
  ('store_opening', 3, 'Have counter keys been handed over to JCs?', 'yes_no_na', 100, 0, 100, true, false, 'daily', null),
  ('store_opening', 4, 'Has the Opening stock count concluded?', 'yes_no_na', 100, 0, 100, true, false, 'daily', null),
  ('store_opening', 5, 'Are all peak-time fittings ON and functional (CCTV, AC, Fire Alarm, Lighting, Music, Digital Screen, LEDs)?', 'yes_no_na', 100, 0, 100, true, false, 'daily', null),
  ('store_opening', 6, 'Are all staff members present in uniform and wearing their name tags?', 'yes_no_na', 100, 0, 100, true, false, 'daily', null),
  ('store_opening', 7, 'Is the manual headcount register updated with today’s staff attendance?', 'yes_no_na', 100, 0, 100, true, true, 'daily', null),
  ('store_opening', 8, 'Is shopfloor cleaning completed before customer entry, including:
1) Store faÃ§ade/glass door cleaned
2) Chairs placed at counters
3) Water bottles stacked
4) Restroom clean and ready
5) Floor mopping (dry & wet) done', 'yes_no_na', 100, 0, 100, true, false, 'daily', null),
  ('store_opening', 9, 'Are security guards deployed as per roster?', 'yes_no_na', 100, 0, 100, true, false, 'daily', null),
  ('store_opening', 10, 'Is the Karatmeter functional and calibrated?', 'yes_no_na', 100, 0, 100, true, true, 'daily', null),
  ('store_opening', 11, 'Are all weighing machines functional & calibrated?', 'yes_no_na', 100, 0, 100, true, false, 'daily', null),
  ('store_opening', 12, 'Have housekeeping and pantry staff arrived on time?', 'yes_no_na', 100, 0, 100, true, false, 'daily', null),
  ('store_opening', 13, 'Is valet parking staff present?', 'yes_no_na', 100, 0, 100, true, false, 'daily', null),
  ('store_opening', 14, 'Is valet parking board placed outside the store at designated location?', 'yes_no_na', 100, 0, 100, true, true, 'daily', null),
  ('store_opening', 15, 'Are the lifts operational and in working condition?', 'yes_no_na', 100, 0, 100, true, false, 'daily', null),
  ('store_opening', 16, 'Are the MTO orders kept in separate box?', 'yes_no_na', 100, 0, 100, true, true, 'daily', null),
  ('store_opening', 17, 'Number of products in MTO box?', 'numeric', null, null, null, false, false, 'daily', null),
  ('store_closing', 1, 'Has the closing stock count concluded?', 'yes_no_na', 100, 0, 100, true, false, 'daily', null),
  ('store_closing', 2, 'Has the opening shift manager collected the keys and signed the key register?', 'yes_no_na', 100, 0, 100, true, false, 'daily', null),
  ('store_closing', 3, 'Have all customers and staff exited and entrances closed?', 'yes_no_na', 100, 0, 100, true, false, 'daily', null),
  ('store_closing', 4, 'Are internal lock seals signed for store closure?', 'yes_no_na', 100, 0, 100, true, true, 'daily', null),
  ('store_closing', 5, 'Are internal access and store exits locked and sealed? (Click photo & enter closure time)', 'yes_no_na', 100, 0, 100, true, true, 'daily', null),
  ('store_closing', 6, 'Are peak-hour fittings switched off and non-peak plan activated?', 'yes_no_na', 100, 0, 100, true, false, 'daily', null),
  ('store_closing', 7, 'Is adequate security manpower available during closing?', 'yes_no_na', 100, 0, 100, true, false, 'daily', null),
  ('store_closing', 8, 'Are the MTO orders kept in separate box? (take picture of box)', 'yes_no_na', 100, 0, 100, true, true, 'daily', null),
  ('store_closing', 9, 'Number of products in MTO box?', 'numeric', null, null, null, false, false, 'daily', null),
  ('sm_checklist', 1, 'Are the displays in counters & backwalls as per the display standards without any product gaps?', 'yes_no_na', 100, 0, 100, true, true, 'daily', null),
  ('sm_checklist', 2, 'Is the Gold Rate for the day displayed on cash counter & reflecting in POS & Sparkle?', 'yes_no_na', 100, 0, 100, true, true, 'daily', null),
  ('sm_checklist', 3, 'Have you verified and signed the key movement register?', 'yes_no_na', 100, 0, 100, true, true, 'daily', null),
  ('sm_checklist', 4, 'Have you checked the attendance & availability of all Staffs (store staffs), HK, Security as per day''s Roaster?', 'yes_no_na', 100, 0, 100, true, true, 'daily', null),
  ('sm_checklist', 5, 'Have you made a summary of previous days sales, KPIs & Mission Happiness Index Summary?', 'yes_no_na', 100, 0, 100, true, true, 'daily', null),
  ('sm_checklist', 6, 'Have you conducted the morning store briefing with the JC, FM, SCM & Cashier presenting the previous days Sales, KPI & MH Performance?', 'yes_no_na', 100, 0, 100, true, true, 'daily', null),
  ('sm_checklist', 7, 'Have you checked the counter stock movement register (randomly check for min 4 counter per day)?', 'yes_no_na', 100, 0, 100, true, true, 'daily', null),
  ('sm_checklist', 8, 'Have you conducted physical count of any 1 counter and checked with the JCs stock count as per the stock movement register?', 'yes_no_na', 100, 0, 100, true, true, 'daily', null),
  ('sm_checklist', 9, 'Have you checked the CCTV functioning & recording status - check for random historic data recording saving in the NVR?', 'yes_no_na', 100, 0, 100, true, true, 'daily', null),
  ('sm_checklist', 10, 'Have we checked the Panel Room/Electrical Room to be free of any goods & fire exists free of obstacles?', 'yes_no_na', 100, 0, 100, true, true, 'daily', null),
  ('sm_checklist', 11, 'Was full store walkaround done, covering:
Staff presence vs shift plan (payroll/contractual)
1)Displays as per store manual/theme
2) Product replenishment
3) Team rate confirmation & offer understanding
4) BOH/Karigar Room manning & stock movement
5) Notice board updated (offers/staff matrix)', 'yes_no_na', 100, 0, 100, true, false, 'daily', null),
  ('sm_checklist', 12, 'Any stock pending for inward/outward? (QC delay, variance, system issue, etc.)', 'yes_no_na', 100, 0, 100, true, false, 'daily', null),
  ('sm_checklist', 13, 'Is bank drop completed and cash handed over to Cash Management Service?', 'yes_no_na', 100, 0, 100, true, false, 'daily', null),
  ('sm_checklist', 14, 'Are all petty cash vouchers and IOUs approved?', 'yes_no_na', 100, 0, 100, true, false, 'daily', null),
  ('sm_checklist', 15, 'Have you checked previous day''s collection summary and cash deposit on current day?', 'yes_no_na', 100, 0, 100, true, false, 'daily', null),
  ('sm_checklist', 16, 'Is Electricity Consumption Register updated and verified?', 'yes_no_na', 100, 0, 100, true, false, 'daily', null),
  ('sm_checklist', 17, 'Is Gold Dust Collection Register checked? (Every Monday)', 'yes_no_na', 100, 0, 100, true, false, 'weekly', 'Mondays only'),
  ('sm_checklist', 18, 'Were previous day’s security call-outs discussed with staff?', 'yes_no_na', 100, 0, 100, true, false, 'daily', null),
  ('sm_checklist', 19, 'Are previous day’s maintenance issues closed?', 'yes_no_na', 100, 0, 100, true, false, 'daily', null),
  ('sm_checklist', 20, 'Is daily customer walk-in data updated to HO team?', 'yes_no_na', 100, 0, 100, true, false, 'daily', null),
  ('sm_checklist', 21, 'Are new tag issue cases checked (apart from SRN)?', 'yes_no_na', 100, 0, 100, true, false, 'daily', null),
  ('sm_checklist', 22, 'Is staff purchase register checked?', 'yes_no_na', 100, 0, 100, true, false, 'daily', null),
  ('sm_checklist', 23, 'Have you checked and verified BTL payment, if amount > 5000? (Every Tuesday)', 'yes_no_na', null, null, null, false, false, 'weekly', 'Tuesdays only'),
  ('sm_checklist', 24, 'Have you checked for Karigar spare PSV? (Every Wednesday)', 'yes_no_na', null, null, null, false, false, 'weekly', 'Wednesdays only'),
  ('scm_checklist', 1, 'Have you checked whether the previous day''s shift is closed along with the tender declaration or not?', 'yes_no_na', 100, 0, 100, true, false, 'daily', null),
  ('scm_checklist', 2, 'Have you verified metal rate updation in POS, validated it with mail received from the Bullion team and displayed Gold Rate Chart prominently at cash counters by 11 Am?', 'yes_no_na', 100, 0, 100, true, false, 'daily', null),
  ('scm_checklist', 3, 'Have you issued float cash to the cashier?', 'yes_no_na', 100, 0, 100, true, false, 'daily', null),
  ('scm_checklist', 4, 'Have you deposited cash with CMS after validating the identity of cash collection agent and shared cash deposit slip with HO Commercial team.', 'yes_no_na', 100, 0, 100, true, false, 'daily', null),
  ('scm_checklist', 5, 'Have you deposited cheques with bank, ensured whether deposit entry is done in F&O and shared cheque deposit slip with HO Commercial team.', 'yes_no_na', 100, 0, 100, true, false, 'daily', null),
  ('scm_checklist', 6, 'Have you conducted BOD stock count with mandatory signatures from respective stakeholders on counter stock registers, and shared Stock Summary Sheet along with Signoff of SCM/Sr cashier and SM/FM to HO Commercial team.', 'yes_no_na', 100, 0, 100, true, false, 'daily', null),
  ('scm_checklist', 7, 'Have You reviewed and filed previous day transaction is respective file post validation by Store Manager with signature i.e Sale Invoice File,  Scheme File(GGP & GQP), Filing of CMS slips(Cash & Cheque),MTO file,Filing of Refund Documents,Customer Order/Customer Advance,Petty Cash Voucher,GRN(Jewellery & Consumable) etc.', 'yes_no_na', 100, 0, 100, true, false, 'daily', null),
  ('scm_checklist', 8, 'Have you updated NEFT payment, E-NACH, or honored cheque payment in POS?', 'yes_no_na', 100, 0, 100, true, false, 'daily', null),
  ('scm_checklist', 9, 'Have you regularized pending manual bill or B2B invoice within 24 hours with an intimation to HO Commercial team?', 'yes_no_na', 100, 0, 100, true, false, 'daily', null),
  ('scm_checklist', 10, 'Whether calibration of  Karatmeter and Weighing Scale conducted thrice on previous day?', 'yes_no_na', 100, 0, 100, true, false, 'daily', null),
  ('scm_checklist', 11, 'Have you reported any compliance or commercial deviation at your store to HO commercial team, if any?', 'yes_no_na', 100, 0, 100, true, false, 'daily', null),
  ('scm_checklist', 12, 'Have you checked open inward and outward transfer orders (TO), consumable TO, in-transit TO, and followed up with concerned person for its closure?', 'yes_no_na', 100, 0, 100, true, false, 'daily', null),
  ('scm_checklist', 13, 'Have you created Transfer Order for COGEP to the Chembur warehouse for 100 grams or every Monday whichever is earlier ?', 'yes_no_na', 100, 0, 100, true, false, 'weekly', 'Mondays only'),
  ('scm_checklist', 14, 'Have you created and uploaded petty cash vouchers after Store Manager''s validation and signature ?', 'yes_no_na', 100, 0, 100, true, false, 'daily', null),
  ('scm_checklist', 15, 'Have you shared approved refund requests with complete documents to HO Commercial?', 'yes_no_na', 100, 0, 100, true, false, 'daily', null),
  ('scm_checklist', 16, 'Have you maintained, updated and shared MTO details with HO Commercial?', 'yes_no_na', 100, 0, 100, true, false, 'daily', null),
  ('scm_checklist', 17, 'Have you tallied all tenders with the system and shared payment/tender reconciliation report with any jumbling remarks to  HO Commercial?', 'yes_no_na', 100, 0, 100, true, false, 'daily', null),
  ('scm_checklist', 18, 'Have you conducted EOD stock count with mandatory signatures from respective stakeholders on counter stock registers, and shared Stock Summary Sheet along with Signoff of SCM/Sr cashier and SM/FM to HO Commercial team.', 'yes_no_na', 100, 0, 100, true, false, 'daily', null)
) as v(template_key, seq, point_of_observation, question_type, score_if_yes, score_if_no, score_if_na, is_scored, requires_photo, cadence, cadence_note)
join checklist_templates t on t.key = v.template_key::checklist_template_key
on conflict (template_id, seq) do nothing;
