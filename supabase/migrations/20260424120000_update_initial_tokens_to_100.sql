-- Update default tokens for new users to 100
ALTER TABLE public.call_tokens ALTER COLUMN tokens SET DEFAULT 100;

-- Update the handle_new_user_tokens function to give 100 tokens
CREATE OR REPLACE FUNCTION public.handle_new_user_tokens()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.call_tokens (user_id, tokens)
  VALUES (NEW.id, 100);
  RETURN NEW;
END;
$$;

-- Give 100 tokens to existing users who currently have less than 100 (optional but helpful for testing)
UPDATE public.call_tokens SET tokens = 100 WHERE tokens < 100;
