-- 1. Enable primary extensions
create extension if not exists pg_cron;
create extension if not exists net;

-- 2. Schedule the background runner
This cron job will wake up every minute to check for outstanding calls
and process retries even if the dashboard is closed.
IMPORTANT: You must replace [PROJECT_REF] and [SERVICE_ROLE_KEY] 
with your actual values in the Supabase Dashboard SQL Editor.

SELECT cron.schedule(
  'background-call-runner',
  '* * * * *',
  $$
  SELECT
    net.http_post(
      url:='https://qcmvdzkuetdkbjbtrgsq.supabase.co/functions/v1/scheduled-calls',
      headers:='{"Content-Type": "application/json"}'::jsonb,
      body:='{}'::jsonb
    ) as request_id;
  $$
);

