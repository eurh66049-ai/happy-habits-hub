DROP TRIGGER IF EXISTS trg_notify_on_new_message ON public.messages;
DROP TRIGGER IF EXISTS trg_notify_on_new_follower ON public.user_followers;
DROP FUNCTION IF EXISTS public.notify_on_new_message();
DROP FUNCTION IF EXISTS public.notify_on_new_follower();