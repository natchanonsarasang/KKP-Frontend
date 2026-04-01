-- Add new columns for payment info
ALTER TABLE public.call_records
ADD COLUMN IF NOT EXISTS due_date TEXT,
ADD COLUMN IF NOT EXISTS amount TEXT;