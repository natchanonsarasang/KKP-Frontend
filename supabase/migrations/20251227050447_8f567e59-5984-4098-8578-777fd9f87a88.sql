-- Drop the existing foreign key constraint
ALTER TABLE public.call_records DROP CONSTRAINT IF EXISTS call_records_template_id_fkey;

-- Recreate it with ON DELETE SET NULL so templates can be deleted
ALTER TABLE public.call_records
ADD CONSTRAINT call_records_template_id_fkey
FOREIGN KEY (template_id) REFERENCES public.call_templates(id) ON DELETE SET NULL;