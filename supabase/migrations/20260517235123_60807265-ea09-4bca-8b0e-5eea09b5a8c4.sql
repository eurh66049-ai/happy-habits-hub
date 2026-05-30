DROP TRIGGER IF EXISTS trg_notify_on_new_message ON public.messages;
DROP FUNCTION IF EXISTS public.notify_on_new_message();

CREATE OR REPLACE FUNCTION public.clean_duplicate_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer := 0;
  legacy_message_deleted integer := 0;
  book_duplicate_deleted integer := 0;
BEGIN
  WITH legacy_message_duplicates AS (
    SELECT legacy.id
    FROM public.notifications AS legacy
    JOIN public.notifications AS canonical
      ON canonical.user_id = legacy.user_id
     AND canonical.type = legacy.type
     AND canonical.title = legacy.title
     AND canonical.message = legacy.message
     AND canonical.target_url = '/messages'
     AND legacy.target_url LIKE '/messages?odaUserId=%'
     AND canonical.id <> legacy.id
     AND ABS(EXTRACT(EPOCH FROM (legacy.created_at - canonical.created_at))) <= 5
    WHERE legacy.type = 'message'
      AND legacy.created_at >= NOW() - INTERVAL '30 days'
  )
  DELETE FROM public.notifications
  WHERE id IN (SELECT id FROM legacy_message_duplicates);

  GET DIAGNOSTICS legacy_message_deleted = ROW_COUNT;

  WITH book_duplicates AS (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY 
               user_id,
               book_submission_id,
               type,
               LEFT(title, 30),
               DATE_TRUNC('hour', created_at)
             ORDER BY created_at DESC
           ) AS rn
    FROM public.notifications
    WHERE created_at >= NOW() - INTERVAL '7 days'
      AND book_submission_id IS NOT NULL
  )
  DELETE FROM public.notifications
  WHERE id IN (
    SELECT id FROM book_duplicates WHERE rn > 1
  );

  GET DIAGNOSTICS book_duplicate_deleted = ROW_COUNT;
  deleted_count := legacy_message_deleted + book_duplicate_deleted;

  RETURN deleted_count;
END;
$$;

SELECT public.clean_duplicate_notifications();