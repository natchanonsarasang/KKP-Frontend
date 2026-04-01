-- Create call_sessions table to track auto-dial sessions
CREATE TABLE public.call_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'stopping', 'completed', 'stopped', 'paused')),
  total_calls INTEGER NOT NULL DEFAULT 0,
  completed_calls INTEGER NOT NULL DEFAULT 0,
  failed_calls INTEGER NOT NULL DEFAULT 0,
  confirmed_calls INTEGER NOT NULL DEFAULT 0,
  tokens_used INTEGER NOT NULL DEFAULT 0,
  settings JSONB DEFAULT '{}'::jsonb,
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.call_sessions ENABLE ROW LEVEL SECURITY;

-- User policies
CREATE POLICY "Users can view their own call sessions"
ON public.call_sessions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own call sessions"
ON public.call_sessions FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own call sessions"
ON public.call_sessions FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own call sessions"
ON public.call_sessions FOR DELETE
USING (auth.uid() = user_id);

-- Admin policies
CREATE POLICY "Admins can view all call sessions"
ON public.call_sessions FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage all call sessions"
ON public.call_sessions FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Service role policy for edge functions
CREATE POLICY "Service role can manage all call sessions"
ON public.call_sessions FOR ALL
USING (auth.role() = 'service_role');

-- Trigger for updated_at
CREATE TRIGGER update_call_sessions_updated_at
BEFORE UPDATE ON public.call_sessions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Index for faster lookups
CREATE INDEX idx_call_sessions_user_workspace ON public.call_sessions(user_id, workspace_id);
CREATE INDEX idx_call_sessions_status ON public.call_sessions(status) WHERE status = 'running';