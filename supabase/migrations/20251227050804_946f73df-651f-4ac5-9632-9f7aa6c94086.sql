-- Create debtors table to track individuals with debt
CREATE TABLE public.debtors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_number TEXT NOT NULL UNIQUE,
  name TEXT,
  total_debt NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paid', 'defaulted', 'negotiating', 'pending')),
  contact_attempts INTEGER NOT NULL DEFAULT 0,
  successful_contacts INTEGER NOT NULL DEFAULT 0,
  last_contact_at TIMESTAMP WITH TIME ZONE,
  last_response TEXT,
  next_follow_up DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.debtors ENABLE ROW LEVEL SECURITY;

-- Create policy for access
CREATE POLICY "Allow all access to debtors" ON public.debtors
  FOR ALL USING (true) WITH CHECK (true);

-- Create trigger for updated_at
CREATE TRIGGER update_debtors_updated_at
  BEFORE UPDATE ON public.debtors
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add index for phone lookup
CREATE INDEX idx_debtors_phone ON public.debtors(phone_number);
CREATE INDEX idx_debtors_status ON public.debtors(status);