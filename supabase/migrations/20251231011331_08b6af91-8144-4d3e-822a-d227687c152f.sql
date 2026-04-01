-- Compute debt sum from JSONB variables (e.g., variables->>'Debt') safely and securely

CREATE OR REPLACE FUNCTION public.sum_debtor_variable(p_user_id uuid, p_key text)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sum numeric;
BEGIN
  -- Access control: caller must be the same user or an admin
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF auth.uid() <> p_user_id AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT COALESCE(
    SUM(
      NULLIF(regexp_replace(COALESCE(variables ->> p_key, ''), '[^0-9\.-]', '', 'g'), '')::numeric
    ),
    0
  )
  INTO v_sum
  FROM public.debtors
  WHERE user_id = p_user_id;

  RETURN v_sum;
END;
$$;