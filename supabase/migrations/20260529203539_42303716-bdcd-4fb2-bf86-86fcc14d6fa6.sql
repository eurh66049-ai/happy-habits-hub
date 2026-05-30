CREATE OR REPLACE FUNCTION public.gam_complete_daily_task_for_user(
  _user_id uuid,
  _task_code public.daily_task_code
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('newly_completed', false, 'reason', 'missing_user');
  END IF;

  RETURN public.complete_daily_task(_user_id, _task_code);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('newly_completed', false, 'reason', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.gam_complete_read_new_book_from_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.gam_complete_daily_task_for_user(NEW.user_id, 'read_new_book'::public.daily_task_code);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS gam_reading_history_daily_task_trigger ON public.reading_history;
CREATE TRIGGER gam_reading_history_daily_task_trigger
AFTER INSERT ON public.reading_history
FOR EACH ROW
EXECUTE FUNCTION public.gam_complete_read_new_book_from_history();

CREATE OR REPLACE FUNCTION public.gam_complete_reading_list_from_recommendation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.gam_complete_daily_task_for_user(NEW.user_id, 'add_to_reading_list'::public.daily_task_code);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS gam_book_recommendations_daily_task_trigger ON public.book_recommendations;
CREATE TRIGGER gam_book_recommendations_daily_task_trigger
AFTER INSERT ON public.book_recommendations
FOR EACH ROW
EXECUTE FUNCTION public.gam_complete_reading_list_from_recommendation();

CREATE OR REPLACE FUNCTION public.gam_complete_review_from_book_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.gam_complete_daily_task_for_user(NEW.user_id, 'add_review'::public.daily_task_code);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS gam_book_reviews_daily_task_trigger ON public.book_reviews;
CREATE TRIGGER gam_book_reviews_daily_task_trigger
AFTER INSERT ON public.book_reviews
FOR EACH ROW
EXECUTE FUNCTION public.gam_complete_review_from_book_review();