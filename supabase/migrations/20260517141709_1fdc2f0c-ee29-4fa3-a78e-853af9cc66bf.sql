CREATE OR REPLACE FUNCTION public.notify_on_new_follower()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE follower_name text;
BEGIN
  IF NEW.following_id IS NULL OR NEW.following_id = NEW.follower_id THEN RETURN NEW; END IF;
  SELECT COALESCE(username, 'مستخدم') INTO follower_name FROM public.profiles WHERE id = NEW.follower_id;
  INSERT INTO public.notifications (user_id, title, message, type, target_url)
  VALUES (
    NEW.following_id,
    'متابع جديد 👥',
    COALESCE(follower_name, 'مستخدم') || ' بدأ بمتابعتك',
    'follow',
    '/user/' || NEW.follower_id::text
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_on_new_follower error: %', SQLERRM;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_notify_on_new_follower ON public.user_followers;
CREATE TRIGGER trg_notify_on_new_follower
AFTER INSERT ON public.user_followers
FOR EACH ROW EXECUTE FUNCTION public.notify_on_new_follower();