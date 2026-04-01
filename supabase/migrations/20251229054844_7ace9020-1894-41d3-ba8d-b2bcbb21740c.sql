-- Drop existing unique constraint on phone_number if it exists
ALTER TABLE public.debtors DROP CONSTRAINT IF EXISTS debtors_phone_number_key;

-- Add composite unique constraint for phone_number per user
ALTER TABLE public.debtors ADD CONSTRAINT debtors_user_phone_unique UNIQUE (user_id, phone_number);