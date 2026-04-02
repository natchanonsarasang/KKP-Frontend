-- Create default workspaces for existing users who don't have one
DO $$
DECLARE
  user_record RECORD;
  new_workspace_id uuid;
BEGIN
  -- Loop through users who don't have any workspace
  FOR user_record IN 
    SELECT DISTINCT p.id as user_id 
    FROM public.profiles p
    LEFT JOIN public.workspaces w ON w.owner_id = p.id
    WHERE w.id IS NULL
  LOOP
    -- Create default workspace
    INSERT INTO public.workspaces (name, owner_id)
    VALUES ('My Workspace', user_record.user_id)
    RETURNING id INTO new_workspace_id;
    
    -- Add as owner member
    INSERT INTO public.workspace_members (workspace_id, user_id, role)
    VALUES (new_workspace_id, user_record.user_id, 'owner');
  END LOOP;
END $$;

-- Assign existing debtors without workspace to their owner's first workspace
UPDATE public.debtors d
SET workspace_id = (
  SELECT w.id 
  FROM public.workspaces w 
  WHERE w.owner_id = d.user_id 
  ORDER BY w.created_at ASC 
  LIMIT 1
)
WHERE d.workspace_id IS NULL AND d.user_id IS NOT NULL;

-- Assign existing call_records without workspace
UPDATE public.call_records cr
SET workspace_id = (
  SELECT w.id 
  FROM public.workspaces w 
  WHERE w.owner_id = cr.user_id 
  ORDER BY w.created_at ASC 
  LIMIT 1
)
WHERE cr.workspace_id IS NULL AND cr.user_id IS NOT NULL;

-- Assign existing call_list_items without workspace
UPDATE public.call_list_items cli
SET workspace_id = (
  SELECT w.id 
  FROM public.workspaces w 
  WHERE w.owner_id = cli.user_id 
  ORDER BY w.created_at ASC 
  LIMIT 1
)
WHERE cli.workspace_id IS NULL AND cli.user_id IS NOT NULL;

-- Assign existing call_templates without workspace
UPDATE public.call_templates ct
SET workspace_id = (
  SELECT w.id 
  FROM public.workspaces w 
  WHERE w.owner_id = ct.user_id 
  ORDER BY w.created_at ASC 
  LIMIT 1
)
WHERE ct.workspace_id IS NULL AND ct.user_id IS NOT NULL;