-- =====================================================================
-- RITA — Push notifications (Expo) trigger
-- =====================================================================
-- New broadcasts (manager announcements, admin broadcasts) fire an Expo push
-- to the targeted users via the send-push edge function. Gold-rate changes call
-- send-push directly from the sync-gold-rate function. Applied live; kept for
-- reproducibility. Replace <ANON_KEY>.
--
-- Requires: pg_net. Users get push only once they've registered a token
-- (native app captures profiles.expo_push_token on sign-in).
-- =====================================================================

create or replace function notify_broadcast_push() returns trigger as $$
begin
  perform net.http_post(
    url     := 'https://ftzczoiucqrirkcpzdyl.supabase.co/functions/v1/send-push',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON_KEY>"}'::jsonb,
    body    := jsonb_build_object(
      'title', new.title,
      'body',  new.body,
      'store_ids', coalesce(
        new.target_store_ids,
        case when new.target_store_id is not null then array[new.target_store_id] else null end
      )
    )
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists broadcast_push on broadcasts;
create trigger broadcast_push after insert on broadcasts
  for each row execute function notify_broadcast_push();
