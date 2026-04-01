-- Add 5 count fields for call outcomes
ALTER TABLE public.debtors
ADD COLUMN picked_up_count integer NOT NULL DEFAULT 0,
ADD COLUMN not_picked_up_count integer NOT NULL DEFAULT 0,
ADD COLUMN accept_count integer NOT NULL DEFAULT 0,
ADD COLUMN reject_count integer NOT NULL DEFAULT 0,
ADD COLUMN other_count integer NOT NULL DEFAULT 0;

-- Create indexes for these fields
CREATE INDEX idx_debtors_picked_up_count ON public.debtors(picked_up_count);
CREATE INDEX idx_debtors_accept_count ON public.debtors(accept_count);
CREATE INDEX idx_debtors_reject_count ON public.debtors(reject_count);