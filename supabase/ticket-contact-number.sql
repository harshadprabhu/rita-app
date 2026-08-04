-- Add contact_number field to tickets (free-text phone number the requester
-- provides per-ticket, synced to Sampark). Idempotent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'contact_number'
  ) THEN
    ALTER TABLE public.tickets ADD COLUMN contact_number text;
  END IF;
END $$;
