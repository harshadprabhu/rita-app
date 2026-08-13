-- Add sampark_technician_name to tickets so technician assignment from Sampark
-- is always visible even when there's no matching RITA profile.
alter table tickets
  add column if not exists sampark_technician_name text;

comment on column tickets.sampark_technician_name is
  'Technician name as returned by Sampark API — source of truth for assignment display when technicians don''t use the RITA app.';
