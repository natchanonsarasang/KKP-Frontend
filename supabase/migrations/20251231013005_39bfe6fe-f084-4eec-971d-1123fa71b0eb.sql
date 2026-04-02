-- Add ON DELETE CASCADE to foreign keys referencing workspaces
-- First, we need to recreate the foreign key constraints with cascade

-- For debtors
ALTER TABLE public.debtors 
DROP CONSTRAINT IF EXISTS debtors_workspace_id_fkey;

ALTER TABLE public.debtors 
ADD CONSTRAINT debtors_workspace_id_fkey 
FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- For call_records
ALTER TABLE public.call_records 
DROP CONSTRAINT IF EXISTS call_records_workspace_id_fkey;

ALTER TABLE public.call_records 
ADD CONSTRAINT call_records_workspace_id_fkey 
FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- For call_list_items
ALTER TABLE public.call_list_items 
DROP CONSTRAINT IF EXISTS call_list_items_workspace_id_fkey;

ALTER TABLE public.call_list_items 
ADD CONSTRAINT call_list_items_workspace_id_fkey 
FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- For call_templates
ALTER TABLE public.call_templates 
DROP CONSTRAINT IF EXISTS call_templates_workspace_id_fkey;

ALTER TABLE public.call_templates 
ADD CONSTRAINT call_templates_workspace_id_fkey 
FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- For workspace_members (already has cascade but let's ensure)
ALTER TABLE public.workspace_members 
DROP CONSTRAINT IF EXISTS workspace_members_workspace_id_fkey;

ALTER TABLE public.workspace_members 
ADD CONSTRAINT workspace_members_workspace_id_fkey 
FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;