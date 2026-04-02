-- Update the deduct_call_token function to accept an amount parameter
CREATE OR REPLACE FUNCTION public.deduct_tokens(p_user_id uuid, p_amount integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  current_tokens integer;
BEGIN
  SELECT tokens INTO current_tokens FROM public.call_tokens WHERE user_id = p_user_id FOR UPDATE;
  
  IF current_tokens IS NULL OR current_tokens < p_amount THEN
    RETURN false;
  END IF;
  
  UPDATE public.call_tokens SET tokens = tokens - p_amount, updated_at = now() WHERE user_id = p_user_id;
  RETURN true;
END;
$function$;