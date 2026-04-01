
-- Add call_duration (in seconds) to call_records for tracking talk time
ALTER TABLE public.call_records ADD COLUMN IF NOT EXISTS call_duration integer DEFAULT NULL;

-- Add is_blocked flag to debtors for block list (do not call)
ALTER TABLE public.debtors ADD COLUMN IF NOT EXISTS is_blocked boolean NOT NULL DEFAULT false;

-- Store duration from webhook in result_data, but also have a dedicated column for analytics
