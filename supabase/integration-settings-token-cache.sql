-- Zoho OAuth access-token cache. Access tokens are valid for ~1 hour; without
-- caching, every edge function invocation (including 3s live-chat polls) was
-- calling accounts.zoho.in/oauth/v2/token which rate-limits at ~10 requests/min
-- with "You have made too many requests continuously" — the whole chat + poll
-- pipeline stopped working the moment a busy screen kept the poll firing.
--
-- Now: token + expiry live in integration_settings; every edge function uses
-- the cached token if it's still valid for at least another 5 minutes,
-- otherwise refreshes once and stores the new pair here for every other
-- request to reuse. Single row (id = 1) — same convention as the existing
-- sampark_service_url etc columns already on this table.

alter table public.integration_settings
  add column if not exists sampark_access_token       text,
  add column if not exists sampark_access_expires_at  timestamptz;
