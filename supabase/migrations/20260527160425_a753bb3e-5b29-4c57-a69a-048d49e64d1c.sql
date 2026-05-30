CREATE OR REPLACE FUNCTION public.notify_reading_club_invitation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_name text;
  v_inviter_name text;
BEGIN
  IF NEW.status <> 'pending' THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_club_name
  FROM public.reading_clubs
  WHERE id = NEW.club_id;

  SELECT username INTO v_inviter_name
  FROM public.profiles
  WHERE id = NEW.invited_by;

  INSERT INTO public.notifications (
    user_id,
    title,
    message,
    type,
    target_url,
    is_read,
    read
  )
  VALUES (
    NEW.invited_user_id,
    '📩 دعوة إلى نادي قراءة',
    'دعاك ' || COALESCE(NULLIF(v_inviter_name, ''), 'مستخدم') || ' للانضمام إلى نادي "' || COALESCE(NULLIF(v_club_name, ''), 'نادي قراءة') || '"',
    'club_invitation',
    '/reading-clubs',
    false,
    false
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_reading_club_invitation ON public.reading_club_invitations;

CREATE TRIGGER trg_notify_reading_club_invitation
AFTER INSERT ON public.reading_club_invitations
FOR EACH ROW
EXECUTE FUNCTION public.notify_reading_club_invitation();

GRANT EXECUTE ON FUNCTION public.notify_reading_club_invitation() TO service_role;

INSERT INTO public.notifications (
  user_id,
  title,
  message,
  type,
  target_url,
  is_read,
  read,
  created_at
)
SELECT
  i.invited_user_id,
  '📩 دعوة إلى نادي قراءة',
  'دعاك ' || COALESCE(NULLIF(p.username, ''), 'مستخدم') || ' للانضمام إلى نادي "' || COALESCE(NULLIF(c.name, ''), 'نادي قراءة') || '"',
  'club_invitation',
  '/reading-clubs',
  false,
  false,
  i.created_at
FROM public.reading_club_invitations i
LEFT JOIN public.reading_clubs c ON c.id = i.club_id
LEFT JOIN public.profiles p ON p.id = i.invited_by
WHERE i.status = 'pending'
  AND NOT EXISTS (
    SELECT 1
    FROM public.notifications n
    WHERE n.user_id = i.invited_user_id
      AND n.type = 'club_invitation'
      AND n.target_url = '/reading-clubs'
      AND n.created_at >= i.created_at - interval '5 seconds'
      AND n.created_at <= i.created_at + interval '5 seconds'
  );