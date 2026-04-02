-- Add indexes for faster sorting and searching on debtors table

-- Index for user_id filtering (most queries filter by user)
CREATE INDEX IF NOT EXISTS idx_debtors_user_id ON public.debtors(user_id);

-- Index for status filtering
CREATE INDEX IF NOT EXISTS idx_debtors_status ON public.debtors(status);

-- Index for phone number search
CREATE INDEX IF NOT EXISTS idx_debtors_phone_number ON public.debtors(phone_number);

-- Index for name search (using text_pattern_ops for LIKE queries)
CREATE INDEX IF NOT EXISTS idx_debtors_name ON public.debtors(name text_pattern_ops);

-- Index for created_at sorting (default sort)
CREATE INDEX IF NOT EXISTS idx_debtors_created_at ON public.debtors(created_at DESC);

-- Composite index for common query pattern: user_id + status
CREATE INDEX IF NOT EXISTS idx_debtors_user_status ON public.debtors(user_id, status);

-- GIN index on variables JSONB for sorting/filtering by dynamic columns
CREATE INDEX IF NOT EXISTS idx_debtors_variables ON public.debtors USING GIN(variables);

-- Indexes for call stats columns that are sortable
CREATE INDEX IF NOT EXISTS idx_debtors_picked_up_count ON public.debtors(picked_up_count DESC);
CREATE INDEX IF NOT EXISTS idx_debtors_not_picked_up_count ON public.debtors(not_picked_up_count DESC);
CREATE INDEX IF NOT EXISTS idx_debtors_accept_count ON public.debtors(accept_count DESC);
CREATE INDEX IF NOT EXISTS idx_debtors_reject_count ON public.debtors(reject_count DESC);
CREATE INDEX IF NOT EXISTS idx_debtors_other_count ON public.debtors(other_count DESC);
CREATE INDEX IF NOT EXISTS idx_debtors_contact_attempts ON public.debtors(contact_attempts DESC);
CREATE INDEX IF NOT EXISTS idx_debtors_last_contact_at ON public.debtors(last_contact_at DESC NULLS LAST);

-- Indexes for call_records table (used for call stats)
CREATE INDEX IF NOT EXISTS idx_call_records_phone_number ON public.call_records(phone_number);
CREATE INDEX IF NOT EXISTS idx_call_records_user_id ON public.call_records(user_id);
CREATE INDEX IF NOT EXISTS idx_call_records_status ON public.call_records(status);