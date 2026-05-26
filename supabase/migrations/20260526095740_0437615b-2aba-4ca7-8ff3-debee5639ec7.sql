
-- 1) Create a deterministic shared Dhipaya workspace
DO $$
DECLARE
  v_owner uuid;
BEGIN
  SELECT id INTO v_owner FROM auth.users ORDER BY created_at ASC LIMIT 1;
  IF v_owner IS NULL THEN
    -- nothing to do, will be created when first user signs up via trigger fallback
    RETURN;
  END IF;

  INSERT INTO public.workspaces (id, name, owner_id)
  VALUES ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', 'Dhipaya Insurance', v_owner)
  ON CONFLICT (id) DO NOTHING;

  -- Backfill membership for every existing user
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  SELECT 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', u.id,
         CASE WHEN u.id = v_owner THEN 'owner' ELSE 'member' END
  FROM auth.users u
  ON CONFLICT DO NOTHING;
END $$;

-- 2) Update handle_new_user_workspace trigger to also enroll new users into the shared workspace
CREATE OR REPLACE FUNCTION public.handle_new_user_workspace()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_workspace_id uuid;
  dhipaya_ws_id uuid := 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1';
  dhipaya_exists boolean;
BEGIN
  INSERT INTO public.workspaces (name, owner_id)
  VALUES ('My Workspace', NEW.id)
  RETURNING id INTO new_workspace_id;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (new_workspace_id, NEW.id, 'owner');

  -- Ensure the shared Dhipaya workspace exists; create it owned by this user if not.
  SELECT EXISTS (SELECT 1 FROM public.workspaces WHERE id = dhipaya_ws_id) INTO dhipaya_exists;
  IF NOT dhipaya_exists THEN
    INSERT INTO public.workspaces (id, name, owner_id)
    VALUES (dhipaya_ws_id, 'Dhipaya Insurance', NEW.id);
    INSERT INTO public.workspace_members (workspace_id, user_id, role)
    VALUES (dhipaya_ws_id, NEW.id, 'owner')
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.workspace_members (workspace_id, user_id, role)
    VALUES (dhipaya_ws_id, NEW.id, 'member')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

-- 3) Add workspace-member-based policies so users can share workspace data
-- debtors
CREATE POLICY "Workspace members can view shared debtors"
  ON public.debtors FOR SELECT TO authenticated
  USING (workspace_id IS NOT NULL AND has_workspace_access(auth.uid(), workspace_id));
CREATE POLICY "Workspace members can insert shared debtors"
  ON public.debtors FOR INSERT TO authenticated
  WITH CHECK (workspace_id IS NOT NULL AND has_workspace_access(auth.uid(), workspace_id) AND auth.uid() = user_id);
CREATE POLICY "Workspace members can update shared debtors"
  ON public.debtors FOR UPDATE TO authenticated
  USING (workspace_id IS NOT NULL AND has_workspace_access(auth.uid(), workspace_id));
CREATE POLICY "Workspace members can delete shared debtors"
  ON public.debtors FOR DELETE TO authenticated
  USING (workspace_id IS NOT NULL AND has_workspace_access(auth.uid(), workspace_id));

-- call_list_items
CREATE POLICY "Workspace members can view shared call list items"
  ON public.call_list_items FOR SELECT TO authenticated
  USING (workspace_id IS NOT NULL AND has_workspace_access(auth.uid(), workspace_id));
CREATE POLICY "Workspace members can insert shared call list items"
  ON public.call_list_items FOR INSERT TO authenticated
  WITH CHECK (workspace_id IS NOT NULL AND has_workspace_access(auth.uid(), workspace_id) AND auth.uid() = user_id);
CREATE POLICY "Workspace members can update shared call list items"
  ON public.call_list_items FOR UPDATE TO authenticated
  USING (workspace_id IS NOT NULL AND has_workspace_access(auth.uid(), workspace_id));
CREATE POLICY "Workspace members can delete shared call list items"
  ON public.call_list_items FOR DELETE TO authenticated
  USING (workspace_id IS NOT NULL AND has_workspace_access(auth.uid(), workspace_id));

-- call_records
CREATE POLICY "Workspace members can view shared call records"
  ON public.call_records FOR SELECT TO authenticated
  USING (workspace_id IS NOT NULL AND has_workspace_access(auth.uid(), workspace_id));
CREATE POLICY "Workspace members can insert shared call records"
  ON public.call_records FOR INSERT TO authenticated
  WITH CHECK (workspace_id IS NOT NULL AND has_workspace_access(auth.uid(), workspace_id) AND auth.uid() = user_id);
CREATE POLICY "Workspace members can update shared call records"
  ON public.call_records FOR UPDATE TO authenticated
  USING (workspace_id IS NOT NULL AND has_workspace_access(auth.uid(), workspace_id));
CREATE POLICY "Workspace members can delete shared call records"
  ON public.call_records FOR DELETE TO authenticated
  USING (workspace_id IS NOT NULL AND has_workspace_access(auth.uid(), workspace_id));

-- call_sessions
CREATE POLICY "Workspace members can view shared call sessions"
  ON public.call_sessions FOR SELECT TO authenticated
  USING (has_workspace_access(auth.uid(), workspace_id));
CREATE POLICY "Workspace members can insert shared call sessions"
  ON public.call_sessions FOR INSERT TO authenticated
  WITH CHECK (has_workspace_access(auth.uid(), workspace_id) AND auth.uid() = user_id);
CREATE POLICY "Workspace members can update shared call sessions"
  ON public.call_sessions FOR UPDATE TO authenticated
  USING (has_workspace_access(auth.uid(), workspace_id));
CREATE POLICY "Workspace members can delete shared call sessions"
  ON public.call_sessions FOR DELETE TO authenticated
  USING (has_workspace_access(auth.uid(), workspace_id));
