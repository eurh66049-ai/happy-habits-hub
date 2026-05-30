
-- 1) Fix presence logic in get_user_conversations
CREATE OR REPLACE FUNCTION public.get_user_conversations(p_user_id uuid)
 RETURNS TABLE(conversation_id uuid, participant_id uuid, participant_username text, participant_avatar_url text, participant_email text, last_message text, last_message_at timestamp with time zone, unread_count bigint, is_online boolean, last_seen timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    c.id as conversation_id,
    CASE WHEN c.participant_1 = p_user_id THEN c.participant_2 ELSE c.participant_1 END as participant_id,
    COALESCE(p.username, p.email, 'مستخدم مجهول') as participant_username,
    p.avatar_url as participant_avatar_url,
    p.email as participant_email,
    m.msg_content as last_message,
    m.msg_created_at as last_message_at,
    COALESCE(unread.count, 0) as unread_count,
    COALESCE(up.up_is_online, false) as is_online,
    COALESCE(up.up_last_ping, p.last_seen) as last_seen
  FROM public.conversations c
  LEFT JOIN public.profiles p ON p.id = (
    CASE WHEN c.participant_1 = p_user_id THEN c.participant_2 ELSE c.participant_1 END
  )
  LEFT JOIN LATERAL (
    SELECT
      bool_or(up_inner.is_online AND up_inner.last_ping > now() - interval '90 seconds') AS up_is_online,
      MAX(up_inner.last_ping) AS up_last_ping
    FROM public.user_presence up_inner
    WHERE up_inner.user_id = (
      CASE WHEN c.participant_1 = p_user_id THEN c.participant_2 ELSE c.participant_1 END
    )
  ) up ON true
  LEFT JOIN LATERAL (
    SELECT msg.content AS msg_content, msg.created_at AS msg_created_at
    FROM public.messages msg
    WHERE msg.conversation_id = c.id
    ORDER BY msg.created_at DESC
    LIMIT 1
  ) m ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) as count
    FROM public.messages unread_msg
    WHERE unread_msg.conversation_id = c.id
      AND unread_msg.sender_id <> p_user_id
      AND unread_msg.is_read = false
  ) unread ON true
  WHERE c.participant_1 = p_user_id OR c.participant_2 = p_user_id
  ORDER BY COALESCE(m.msg_created_at, c.last_message_at, c.created_at) DESC NULLS LAST;
END;
$function$;

-- 2) Trigger: on new message, insert notification + send FCM push to the recipient
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
  v_anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5ZG15eHNneXhldWJobXF6cmdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY0ODQ3NjQsImV4cCI6MjA2MjA2MDc2NH0.b-ckDfOmmf2x__FG5Snm9px8j4pqPke5Ra1RgoGEqP0';
BEGIN
  -- find recipient
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

  -- in-app notification
  INSERT INTO public.notifications (user_id, title, message, type, target_url)
  VALUES (
    v_recipient,
    'رسالة جديدة من ' || v_sender_name,
    v_body,
    'message',
    '/messages'
  );

  -- fire-and-forget FCM push via pg_net
  PERFORM net.http_post(
    url := 'https://kydmyxsgyxeubhmqzrgo.supabase.co/functions/v1/send-fcm-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon_key
    ),
    body := jsonb_build_object(
      'user_id', v_recipient,
      'title', 'رسالة جديدة من ' || v_sender_name,
      'message', v_body,
      'target_url', '/messages',
      'type', 'message'
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- never block message insert because of notifications
  RAISE WARNING 'notify_new_message failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_message ON public.messages;
CREATE TRIGGER trg_notify_new_message
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.notify_new_message();

-- 3) Trigger: on new follower, notify the followed user
CREATE OR REPLACE FUNCTION public.notify_new_follower()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_follower_name text;
  v_anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5ZG15eHNneXhldWJobXF6cmdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY0ODQ3NjQsImV4cCI6MjA2MjA2MDc2NH0.b-ckDfOmmf2x__FG5Snm9px8j4pqPke5Ra1RgoGEqP0';
BEGIN
  IF NEW.follower_id = NEW.following_id THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(p.username, p.email, 'مستخدم') INTO v_follower_name
  FROM public.profiles p WHERE p.id = NEW.follower_id;

  INSERT INTO public.notifications (user_id, title, message, type, target_url)
  VALUES (
    NEW.following_id,
    'متابع جديد',
    v_follower_name || ' بدأ بمتابعتك',
    'follow',
    '/profile/' || NEW.follower_id
  );

  PERFORM net.http_post(
    url := 'https://kydmyxsgyxeubhmqzrgo.supabase.co/functions/v1/send-fcm-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon_key
    ),
    body := jsonb_build_object(
      'user_id', NEW.following_id,
      'title', 'متابع جديد',
      'message', v_follower_name || ' بدأ بمتابعتك',
      'target_url', '/profile/' || NEW.follower_id,
      'type', 'follow'
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_new_follower failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_follower ON public.user_followers;
CREATE TRIGGER trg_notify_new_follower
AFTER INSERT ON public.user_followers
FOR EACH ROW EXECUTE FUNCTION public.notify_new_follower();
