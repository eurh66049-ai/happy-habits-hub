
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Unschedule if exists (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('auto-embed-books');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'auto-embed-books',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://kydmyxsgyxeubhmqzrgo.supabase.co/functions/v1/embed-books-batch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5ZG15eHNneXhldWJobXF6cmdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY0ODQ3NjQsImV4cCI6MjA2MjA2MDc2NH0.b-ckDfOmmf2x__FG5Snm9px8j4pqPke5Ra1RgoGEqP0'
    ),
    body := '{"batchSize":100}'::jsonb
  ) AS request_id;
  $$
);
