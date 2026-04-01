-- Add indexes for sorting and filtering performance
CREATE INDEX IF NOT EXISTS idx_debtors_total_debt ON public.debtors(total_debt DESC);
CREATE INDEX IF NOT EXISTS idx_debtors_due_date ON public.debtors(due_date DESC);
CREATE INDEX IF NOT EXISTS idx_debtors_contact_attempts ON public.debtors(contact_attempts DESC);
CREATE INDEX IF NOT EXISTS idx_debtors_last_contact_at ON public.debtors(last_contact_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_debtors_status ON public.debtors(status);
CREATE INDEX IF NOT EXISTS idx_debtors_phone_number ON public.debtors(phone_number);
CREATE INDEX IF NOT EXISTS idx_debtors_name ON public.debtors(name);