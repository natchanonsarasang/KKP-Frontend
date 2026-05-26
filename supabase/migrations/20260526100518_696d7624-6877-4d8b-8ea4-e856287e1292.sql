-- Revert the shared Dhipaya workspace: each user has their own workspace.
CREATE OR REPLACE FUNCTION public.handle_new_user_workspace()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_workspace_id uuid;
BEGIN
  INSERT INTO public.workspaces (name, owner_id)
  VALUES ('My Workspace', NEW.id)
  RETURNING id INTO new_workspace_id;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (new_workspace_id, NEW.id, 'owner');

  RETURN NEW;
END;
$function$;

-- Remove all users from the shared Dhipaya workspace except its owner, and delete it if present.
DELETE FROM public.workspace_members
WHERE workspace_id = 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1';

DELETE FROM public.workspaces
WHERE id = 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1';