-- Add due_date column to debtors table
ALTER TABLE public.debtors 
ADD COLUMN due_date DATE;