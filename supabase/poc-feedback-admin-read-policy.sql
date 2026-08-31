-- poc_feedback had insert/update/select policies scoped to "own row only"
-- (Users can view their own feedback) but no policy letting admin/manager
-- roles see everyone's submissions. getAllFeedback() — used by
-- PocFeedbackAnalytics, exposed to both the (admin) and (manager) route
-- groups — would return zero rows for those roles even once real feedback
-- exists, since RLS silently filters out every row that isn't the
-- caller's own.
--
-- Apply live with:
--   supabase db query --linked < supabase/poc-feedback-admin-read-policy.sql

drop policy if exists "poc_feedback: staff read all" on poc_feedback;
create policy "poc_feedback: staff read all" on poc_feedback for select
  using (current_role_is(array['admin','manager']::user_role[]));
