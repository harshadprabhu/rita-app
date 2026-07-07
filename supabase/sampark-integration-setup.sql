-- =====================================================================
-- RITA — ManageEngine ServiceDesk Plus (Sampark) integration: data layer
-- =====================================================================
-- Foundation for the Sampark integration. Applied to the live DB already;
-- kept here for reproducibility on fresh installs.
--
-- Flow (built in later phases once OAuth creds are configured):
--   - On ticket raise, RITA creates a request in Sampark and stores its
--     display_id as the RITA ticket's Sampark id (RITA id == Sampark id).
--   - Sampark's internal request id is kept for API calls (notes, status,
--     attachments).
--   - A daily job syncs Sampark's category/subcategory taxonomy into
--     ticket_categories; the RITA keyword parser is tuned to match it.
--   - A webhook (Sampark Custom Trigger) pushes technician notes + status
--     changes back onto the RITA ticket in real time.
-- =====================================================================

-- Admin-managed Sampark connection settings (Zoho OAuth self-client).
alter table integration_settings
  add column if not exists sampark_enabled       boolean not null default false,
  add column if not exists sampark_service_url   text,   -- e.g. https://sdpondemand.manageengine.in
  add column if not exists sampark_portal        text,   -- the /app/<portal>/ segment, e.g. itdesk
  add column if not exists sampark_data_center   text default 'in', -- zoho DC: com | in | eu | com.au | jp
  add column if not exists sampark_client_id     text,
  add column if not exists sampark_client_secret text,
  add column if not exists sampark_refresh_token text;

-- Link a RITA ticket to its Sampark request.
alter table tickets
  add column if not exists sampark_request_id text,  -- Sampark internal id (for API calls)
  add column if not exists sampark_display_id text,  -- Sampark human ticket no. (mirrors ticket_number)
  add column if not exists sampark_synced_at  timestamptz;

-- Category/subcategory taxonomy synced from Sampark; the RITA parser and the
-- create-ticket picker use only these values.
create table if not exists ticket_categories (
  id             text primary key,   -- Sampark category/subcategory id
  name           text not null,
  parent_id      text,               -- parent category id for subcategories
  is_subcategory boolean not null default false,
  is_active      boolean not null default true,
  updated_at     timestamptz not null default now()
);
alter table ticket_categories enable row level security;
drop policy if exists ticket_categories_read on ticket_categories;
create policy ticket_categories_read on ticket_categories for select using (true);
