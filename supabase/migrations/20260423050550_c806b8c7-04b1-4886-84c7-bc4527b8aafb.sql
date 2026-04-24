-- Enable required extensions for scheduled background jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule the scheduled-calls edge function to run every minute
-- SELECT cron.schedule(
--   'invoke-scheduled-calls-every-minute',
--   '* * * * *',
--   $$
--   SELECT net.http_post(
--     url := 'https://qcmvdzkuetdkbjbtrgsq.supabase.co/functions/v1/scheduled-calls',
--     headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFjbXZkemt1ZXRka2JqYnRyZ3NxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwMjU3NjksImV4cCI6MjA5MDYwMTc2OX0.OdunV8mstXKmse_FYUDOCeJ8ctnppA9PpwLv6F1sN2E"}'::jsonb,
--     body := concat('{"time": "', now(), '"}')::jsonb
--   ) AS request_id;
--   $$
-- );