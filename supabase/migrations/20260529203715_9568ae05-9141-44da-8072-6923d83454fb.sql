CREATE OR REPLACE FUNCTION public.gam_complete_read_new_book_from_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  today date := (now() AT TIME ZONE 'UTC')::date;
  old_read_date date;
  new_read_date date := (NEW.last_read_at AT TIME ZONE 'UTC')::date;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.gam_complete_daily_task_for_user(NEW.user_id, 'read_new_book'::public.daily_task_code);
    RETURN NEW;
  END IF;

  old_read_date := (OLD.last_read_at AT TIME ZONE 'UTC')::date;
  IF TG_OP = 'UPDATE' AND new_read_date = today AND old_read_date IS DISTINCT FROM today THEN
    PERFORM public.gam_complete_daily_task_for_user(NEW.user_id, 'read_new_book'::public.daily_task_code);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS gam_reading_history_daily_task_trigger ON public.reading_history;
CREATE TRIGGER gam_reading_history_daily_task_trigger
AFTER INSERT OR UPDATE OF last_read_at ON public.reading_history
FOR EACH ROW
EXECUTE FUNCTION public.gam_complete_read_new_book_from_history();