-- Drop the restrictive policy and recreate as permissive
DROP POLICY IF EXISTS "Users can view their own tokens" ON public.call_tokens;

CREATE POLICY "Users can view their own tokens"
ON public.call_tokens FOR SELECT
TO authenticated
USING (auth.uid() = user_id);