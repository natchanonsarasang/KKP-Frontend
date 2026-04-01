-- Add user_id to debtors table
ALTER TABLE public.debtors ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add user_id and is_system_default to call_templates table
ALTER TABLE public.call_templates ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.call_templates ADD COLUMN is_system_default BOOLEAN NOT NULL DEFAULT false;

-- Mark existing templates as system defaults
UPDATE public.call_templates SET is_system_default = true WHERE user_id IS NULL;

-- Add user_id to call_records table
ALTER TABLE public.call_records ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Drop existing policies
DROP POLICY IF EXISTS "Allow all access to debtors" ON public.debtors;
DROP POLICY IF EXISTS "Allow all access to call_templates" ON public.call_templates;
DROP POLICY IF EXISTS "Allow all access to call_records" ON public.call_records;

-- Create RLS policies for debtors (users can only see their own)
CREATE POLICY "Users can view their own debtors"
ON public.debtors FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own debtors"
ON public.debtors FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own debtors"
ON public.debtors FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own debtors"
ON public.debtors FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Create RLS policies for call_templates (users see their own + system defaults)
CREATE POLICY "Users can view their own and system templates"
ON public.call_templates FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR is_system_default = true);

CREATE POLICY "Users can insert their own templates"
ON public.call_templates FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id AND is_system_default = false);

CREATE POLICY "Users can update their own templates"
ON public.call_templates FOR UPDATE
TO authenticated
USING (auth.uid() = user_id AND is_system_default = false);

CREATE POLICY "Users can delete their own templates"
ON public.call_templates FOR DELETE
TO authenticated
USING (auth.uid() = user_id AND is_system_default = false);

-- Create RLS policies for call_records (users can only see their own)
CREATE POLICY "Users can view their own call records"
ON public.call_records FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own call records"
ON public.call_records FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own call records"
ON public.call_records FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own call records"
ON public.call_records FOR DELETE
TO authenticated
USING (auth.uid() = user_id);