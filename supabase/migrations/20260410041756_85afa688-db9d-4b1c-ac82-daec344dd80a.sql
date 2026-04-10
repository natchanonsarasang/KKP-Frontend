
CREATE TABLE public.call_attempts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  call_list_item_id uuid REFERENCES public.call_list_items(id) ON DELETE CASCADE NOT NULL,
  call_record_id uuid REFERENCES public.call_records(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  attempt_number integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'calling',
  call_outcome text,
  picked_up boolean DEFAULT false,
  ai_category text,
  conversation_log text,
  audio_url text,
  call_duration integer,
  error_reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.call_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own attempts" ON public.call_attempts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own attempts" ON public.call_attempts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can view all attempts" ON public.call_attempts FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can manage all attempts" ON public.call_attempts FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Service role can manage attempts" ON public.call_attempts FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX idx_call_attempts_item ON public.call_attempts(call_list_item_id);
CREATE INDEX idx_call_attempts_user ON public.call_attempts(user_id);
