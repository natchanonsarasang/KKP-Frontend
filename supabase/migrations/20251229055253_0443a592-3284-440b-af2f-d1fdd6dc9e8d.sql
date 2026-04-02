-- Create call_tokens table
CREATE TABLE public.call_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  tokens integer NOT NULL DEFAULT 10,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.call_tokens ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own tokens"
ON public.call_tokens FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own tokens"
ON public.call_tokens FOR UPDATE
USING (auth.uid() = user_id);

-- Function to initialize tokens for new users
CREATE OR REPLACE FUNCTION public.handle_new_user_tokens()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.call_tokens (user_id, tokens)
  VALUES (NEW.id, 10);
  RETURN NEW;
END;
$$;

-- Trigger to create tokens when user is created
CREATE TRIGGER on_auth_user_created_tokens
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_tokens();

-- Function to deduct token
CREATE OR REPLACE FUNCTION public.deduct_call_token(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_tokens integer;
BEGIN
  SELECT tokens INTO current_tokens FROM public.call_tokens WHERE user_id = p_user_id FOR UPDATE;
  
  IF current_tokens IS NULL OR current_tokens < 1 THEN
    RETURN false;
  END IF;
  
  UPDATE public.call_tokens SET tokens = tokens - 1, updated_at = now() WHERE user_id = p_user_id;
  RETURN true;
END;
$$;

-- Add trigger for updated_at
CREATE TRIGGER update_call_tokens_updated_at
  BEFORE UPDATE ON public.call_tokens
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Initialize tokens for existing users
INSERT INTO public.call_tokens (user_id, tokens)
SELECT id, 10 FROM auth.users
ON CONFLICT (user_id) DO NOTHING;