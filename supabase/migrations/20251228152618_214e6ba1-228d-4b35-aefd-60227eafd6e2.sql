-- Add variables JSON column to debtors table for dynamic template fields
ALTER TABLE public.debtors ADD COLUMN variables jsonb DEFAULT '{}'::jsonb;