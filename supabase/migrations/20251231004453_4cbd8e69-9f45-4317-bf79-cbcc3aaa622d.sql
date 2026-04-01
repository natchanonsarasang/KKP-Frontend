-- Add admin policies to debtors table
CREATE POLICY "Admins can view all debtors" 
ON public.debtors 
FOR SELECT 
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert debtors for any user" 
ON public.debtors 
FOR INSERT 
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update all debtors" 
ON public.debtors 
FOR UPDATE 
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete all debtors" 
ON public.debtors 
FOR DELETE 
USING (public.has_role(auth.uid(), 'admin'));

-- Add admin policies to call_list_items table
CREATE POLICY "Admins can view all call list items" 
ON public.call_list_items 
FOR SELECT 
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert call list items for any user" 
ON public.call_list_items 
FOR INSERT 
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update all call list items" 
ON public.call_list_items 
FOR UPDATE 
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete all call list items" 
ON public.call_list_items 
FOR DELETE 
USING (public.has_role(auth.uid(), 'admin'));

-- Add admin policies to call_records table
CREATE POLICY "Admins can view all call records" 
ON public.call_records 
FOR SELECT 
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert call records for any user" 
ON public.call_records 
FOR INSERT 
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update all call records" 
ON public.call_records 
FOR UPDATE 
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete all call records" 
ON public.call_records 
FOR DELETE 
USING (public.has_role(auth.uid(), 'admin'));

-- Add admin policies to call_templates table
CREATE POLICY "Admins can view all templates" 
ON public.call_templates 
FOR SELECT 
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert templates for any user" 
ON public.call_templates 
FOR INSERT 
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update all templates" 
ON public.call_templates 
FOR UPDATE 
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete all templates" 
ON public.call_templates 
FOR DELETE 
USING (public.has_role(auth.uid(), 'admin'));

-- Add admin policy to view all profiles
CREATE POLICY "Admins can view all profiles" 
ON public.profiles 
FOR SELECT 
USING (public.has_role(auth.uid(), 'admin'));