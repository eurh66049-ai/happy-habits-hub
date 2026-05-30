CREATE OR REPLACE FUNCTION public.gam_complete_quote_daily_task()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    PERFORM public.gam_complete_daily_task_for_user(NEW.user_id, 'share_quote'::public.daily_task_code);
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'Error in gam_complete_quote_daily_task: %', SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS gam_quotes_daily_task_trigger ON public.quotes;
CREATE TRIGGER gam_quotes_daily_task_trigger
AFTER INSERT ON public.quotes
FOR EACH ROW
EXECUTE FUNCTION public.gam_complete_quote_daily_task();

CREATE OR REPLACE FUNCTION public.award_quote_points()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  quote_challenge_id uuid;
  points_per_quote integer;
BEGIN
  FOR quote_challenge_id, points_per_quote IN
    SELECT id, COALESCE((rules->>'points_per_quote')::integer, 5)
    FROM public.challenges
    WHERE challenge_type = 'quotes'
      AND status = 'active'
      AND start_date <= NOW()
      AND end_date >= NOW()
  LOOP
    PERFORM public.update_challenge_score(
      quote_challenge_id,
      NEW.user_id,
      'quote_add',
      points_per_quote,
      jsonb_build_object('quote_id', NEW.id, 'quote_text', NEW.quote_text)
    );
  END LOOP;

  RETURN NEW;
EXCEPTION
  WHEN others THEN
    RAISE LOG 'Error in award_quote_points: %', SQLERRM;
    RETURN NEW;
END;
$$;