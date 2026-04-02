-- Add INSERT policy for call_tokens so users can have their tokens created
CREATE POLICY "Users can insert their own tokens"
ON public.call_tokens FOR INSERT
WITH CHECK (auth.uid() = user_id);