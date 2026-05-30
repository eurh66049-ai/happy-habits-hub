CREATE OR REPLACE FUNCTION public.notify_new_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_recipient uuid;
  v_sender_name text;
  v_body text;
  v_title text;
  v_already_exists boolean;
  v_anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5ZG15eHNneXhldWJobXF6cmdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY0ODQ3NjQsImV4cCI6MjA2MjA2MDc2NH0.b-ckDfOmmf2x__FG5Snm9px8j4pqPke5Ra1RgoGEqP0';
BEGIN
  SELECT CASE WHEN c.participant_1 = NEW.sender_id THEN c.participant_2 ELSE c.participant_1 END
    INTO v_recipient
  FROM public.conversations c
  WHERE c.id = NEW.conversation_id;

  IF v_recipient IS NULL OR v_recipient = NEW.sender_id THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(p.username, p.email, 'مستخدم') INTO v_sender_name
  FROM public.profiles p WHERE p.id = NEW.sender_id;

  v_body := CASE
    WHEN NEW.message_type = 'audio' THEN '🎤 رسالة صوتية'
    ELSE LEFT(COALESCE(NEW.content, ''), 120)
  END;
  v_title := 'رسالة جديدة من ' || v_sender_name;

  -- منع التكرار: إذا أُدخل إشعار مماثل خلال 60 ثانية لا ننشئ نسخة ثانية
  SELECT EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.user_id = v_recipient
      AND n.type = 'message'
      AND n.title = v_title
      AND n.message = v_body
      AND n.created_at >= now() - interval '60 seconds'
  ) INTO v_already_exists;

  IF v_already_exists THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, title, message, type, target_url)
  VALUES (v_recipient, v_title, v_body, 'message', '/messages');

  PERFORM net.http_post(
    url := 'https://kydmyxsgyxeubhmqzrgo.supabase.co/functions/v1/send-fcm-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon_key
    ),
    body := jsonb_build_object(
      'user_id', v_recipient,
      'title', v_title,
      'message', v_body,
      'target_url', '/messages',
      'type', 'message'
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_new_message failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- تنظيف أي تكرارات متبقية لإشعارات الرسائل خلال دقيقة واحدة
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, type, title, message, date_trunc('minute', created_at)
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.notifications
  WHERE type = 'message'
    AND created_at >= now() - interval '30 days'
)
DELETE FROM public.notifications
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);