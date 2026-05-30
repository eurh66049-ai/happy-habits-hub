
-- Enable pg_net for HTTP calls from database triggers
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Store the project ref and service role key as DB settings via a config function
-- We'll read SUPABASE_URL and SERVICE_ROLE_KEY from vault if needed, but for simplicity
-- the trigger uses the project's public functions URL.

CREATE OR REPLACE FUNCTION public.send_fcm_push_on_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  function_url TEXT := 'https://kydmyxsgyxeubhmqzrgo.supabase.co/functions/v1/send-fcm-push';
  anon_key TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5ZG15eHNneXhldWJobXF6cmdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY0ODQ3NjQsImV4cCI6MjA2MjA2MDc2NH0.b-ckDfOmmf2x__FG5Snm9px8j4pqPke5Ra1RgoGEqP0';
BEGIN
  -- Only send push when there's a user_id
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || anon_key
    ),
    body := jsonb_build_object(
      'user_id', NEW.user_id::text,
      'title', COALESCE(NEW.title, 'إشعار جديد'),
      'message', COALESCE(NEW.message, ''),
      'target_url', COALESCE(NEW.target_url, ''),
      'type', COALESCE(NEW.type, 'general')
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block notification insert if push fails
  RAISE WARNING 'send_fcm_push_on_notification error: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_send_fcm_push_on_notification ON public.notifications;

CREATE TRIGGER trg_send_fcm_push_on_notification
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.send_fcm_push_on_notification();
