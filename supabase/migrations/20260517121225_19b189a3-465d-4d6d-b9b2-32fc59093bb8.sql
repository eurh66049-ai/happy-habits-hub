-- Ensure pg_net
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Trigger on notifications to send FCM push
DROP TRIGGER IF EXISTS trg_send_fcm_push_on_notification ON public.notifications;
CREATE TRIGGER trg_send_fcm_push_on_notification
AFTER INSERT ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.send_fcm_push_on_notification();

-- Function: notify receiver on new direct message
CREATE OR REPLACE FUNCTION public.notify_on_new_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  sender_name text;
  receiver_id uuid;
  preview text;
BEGIN
  SELECT COALESCE(username, full_name, 'مستخدم') INTO sender_name
  FROM public.profiles WHERE id = NEW.sender_id;

  SELECT CASE WHEN c.participant_1 = NEW.sender_id THEN c.participant_2 ELSE c.participant_1 END
  INTO receiver_id
  FROM public.conversations c WHERE c.id = NEW.conversation_id;

  IF receiver_id IS NULL OR receiver_id = NEW.sender_id THEN
    RETURN NEW;
  END IF;

  preview := LEFT(COALESCE(NEW.content, ''), 80);
  IF NEW.message_type = 'audio' OR (NEW.audio_url IS NOT NULL AND COALESCE(NEW.content,'') = '') THEN
    preview := '🎤 رسالة صوتية';
  END IF;

  INSERT INTO public.notifications (user_id, title, message, type, target_url)
  VALUES (
    receiver_id,
    'رسالة جديدة من ' || COALESCE(sender_name, 'مستخدم'),
    preview,
    'message',
    '/messages?odaUserId=' || NEW.sender_id::text
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_on_new_message error: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_new_message ON public.messages;
CREATE TRIGGER trg_notify_on_new_message
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.notify_on_new_message();

-- Function: notify receiver on new message request (friend request)
CREATE OR REPLACE FUNCTION public.notify_on_new_message_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  sender_name text;
  preview text;
BEGIN
  IF NEW.receiver_id IS NULL OR NEW.receiver_id = NEW.sender_id THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(username, full_name, 'مستخدم') INTO sender_name
  FROM public.profiles WHERE id = NEW.sender_id;

  preview := LEFT(COALESCE(NEW.message, 'يريد التحدث معك'), 80);

  INSERT INTO public.notifications (user_id, title, message, type, target_url)
  VALUES (
    NEW.receiver_id,
    'طلب محادثة جديد من ' || COALESCE(sender_name, 'مستخدم'),
    preview,
    'message_request',
    '/messages?tab=requests'
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_on_new_message_request error: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_new_message_request ON public.message_requests;
CREATE TRIGGER trg_notify_on_new_message_request
AFTER INSERT ON public.message_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_on_new_message_request();