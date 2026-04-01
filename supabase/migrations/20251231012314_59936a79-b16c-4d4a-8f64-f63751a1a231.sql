-- Drop the old unique constraint that only considers user_id + phone_number
ALTER TABLE public.debtors DROP CONSTRAINT IF EXISTS debtors_user_phone_unique;

-- Create a new unique constraint that includes workspace_id
ALTER TABLE public.debtors ADD CONSTRAINT debtors_user_workspace_phone_unique UNIQUE (user_id, workspace_id, phone_number);