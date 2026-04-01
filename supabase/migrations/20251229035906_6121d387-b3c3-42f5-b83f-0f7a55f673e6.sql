-- Create call_list_items table for transaction-level call tracking
CREATE TABLE public.call_list_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  debtor_id UUID NOT NULL REFERENCES public.debtors(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  template_id UUID REFERENCES public.call_templates(id),
  scheduled_at TIMESTAMP WITH TIME ZONE,
  called_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'pending',
  call_record_id UUID REFERENCES public.call_records(id),
  call_outcome TEXT,
  picked_up BOOLEAN,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.call_list_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for call_list_items
CREATE POLICY "Users can view their own call list items"
ON public.call_list_items
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own call list items"
ON public.call_list_items
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own call list items"
ON public.call_list_items
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own call list items"
ON public.call_list_items
FOR DELETE
USING (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_call_list_items_updated_at
BEFORE UPDATE ON public.call_list_items
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for common queries
CREATE INDEX idx_call_list_items_debtor_id ON public.call_list_items(debtor_id);
CREATE INDEX idx_call_list_items_user_id ON public.call_list_items(user_id);
CREATE INDEX idx_call_list_items_status ON public.call_list_items(status);
CREATE INDEX idx_call_list_items_scheduled_at ON public.call_list_items(scheduled_at);