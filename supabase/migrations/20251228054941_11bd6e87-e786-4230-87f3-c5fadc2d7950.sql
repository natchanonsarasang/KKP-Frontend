-- Add call tracking fields to debtors table
ALTER TABLE public.debtors
ADD COLUMN call_answered boolean DEFAULT NULL,
ADD COLUMN call_outcome text DEFAULT NULL;

-- Add index for filtering by call outcome
CREATE INDEX idx_debtors_call_answered ON public.debtors(call_answered);
CREATE INDEX idx_debtors_call_outcome ON public.debtors(call_outcome);

COMMENT ON COLUMN public.debtors.call_answered IS 'Whether the last call was picked up (true) or not (false), NULL if never called';
COMMENT ON COLUMN public.debtors.call_outcome IS 'Result when call answered: accepted, declined, unknown';