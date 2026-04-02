-- Change next_follow_up from DATE to TIMESTAMP to include time
ALTER TABLE public.debtors 
ALTER COLUMN next_follow_up TYPE TIMESTAMP WITH TIME ZONE 
USING next_follow_up::TIMESTAMP WITH TIME ZONE;

-- Add a column to track if auto-call is enabled for this debtor
ALTER TABLE public.debtors 
ADD COLUMN auto_call_enabled BOOLEAN NOT NULL DEFAULT false;

-- Add index for efficient querying of pending follow-ups
CREATE INDEX idx_debtors_follow_up ON public.debtors(next_follow_up) WHERE next_follow_up IS NOT NULL AND auto_call_enabled = true;