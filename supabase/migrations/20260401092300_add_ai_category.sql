-- Add ai_category to call_records for tracking AI-predicted outcomes
ALTER TABLE public.call_records ADD COLUMN IF NOT EXISTS ai_category TEXT DEFAULT NULL;

-- Add ai_category to call_list_items for analytics
ALTER TABLE public.call_list_items ADD COLUMN IF NOT EXISTS ai_category TEXT DEFAULT NULL;
