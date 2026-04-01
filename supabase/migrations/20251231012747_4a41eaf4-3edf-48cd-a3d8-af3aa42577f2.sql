-- Drop the unique constraint that prevents duplicate phone numbers
ALTER TABLE public.debtors DROP CONSTRAINT IF EXISTS debtors_user_workspace_phone_unique;