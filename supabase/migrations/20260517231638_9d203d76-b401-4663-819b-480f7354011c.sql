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
    CASE 
      WHEN c.participant_1 = p_user_id THEN c.participant_2
      ELSE c.participant_1
    END as participant_id,
    COALESCE(p.username, p.email, 'مستخدم مجهول') as participant_username,
    p.avatar_url as participant_avatar_url,
    p.email as participant_email,
    m.content as last_message,
    m.created_at as last_message_at,
    COALESCE(unread.count, 0) as unread_count,
    COALESCE(up.up_is_online, false) as is_online,
    COALESCE(up.up_last_ping, p.last_seen) as last_seen
  FROM public.conversations c
  LEFT JOIN public.profiles p ON p.id = (
    CASE 
      WHEN c.participant_1 = p_user_id THEN c.participant_2
      ELSE c.participant_1
    END
  )
  LEFT JOIN LATERAL (
    SELECT up_inner.is_online AS up_is_online, up_inner.last_ping AS up_last_ping
    FROM public.user_presence up_inner
    WHERE up_inner.user_id = (
      CASE 
        WHEN c.participant_1 = p_user_id THEN c.participant_2
        ELSE c.participant_1
      END
    )
    ORDER BY up_inner.is_online DESC, up_inner.last_ping DESC NULLS LAST
    LIMIT 1
  ) up ON true
  LEFT JOIN LATERAL (
    SELECT msg.content, msg.created_at
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
  ORDER BY COALESCE(m.created_at, c.last_message_at, c.created_at) DESC NULLS LAST;
END;
$function$;