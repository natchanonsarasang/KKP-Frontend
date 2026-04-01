-- Create call templates table
CREATE TABLE public.call_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id TEXT, -- ID returned from Botnoi API
  message TEXT NOT NULL,
  confirm_message TEXT NOT NULL,
  decline_message TEXT NOT NULL,
  fallback_message TEXT NOT NULL,
  org_name TEXT NOT NULL DEFAULT 'บอทน้อย',
  speaker_id TEXT NOT NULL DEFAULT '523',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create call records table
CREATE TABLE public.call_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID REFERENCES public.call_templates(id),
  phone_number TEXT NOT NULL,
  appointment_date TEXT,
  appointment_time TEXT,
  status TEXT DEFAULT 'pending', -- pending, calling, confirmed, declined, failed, no_answer
  botnoi_call_id TEXT,
  result_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.call_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_records ENABLE ROW LEVEL SECURITY;

-- Allow public access for this demo (no auth required)
CREATE POLICY "Allow all access to call_templates"
ON public.call_templates
FOR ALL
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow all access to call_records"
ON public.call_records
FOR ALL
USING (true)
WITH CHECK (true);

-- Enable realtime for call_records
ALTER PUBLICATION supabase_realtime ADD TABLE public.call_records;

-- Create updated_at trigger function if not exists
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Triggers
CREATE TRIGGER update_call_templates_updated_at
  BEFORE UPDATE ON public.call_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_call_records_updated_at
  BEFORE UPDATE ON public.call_records
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();