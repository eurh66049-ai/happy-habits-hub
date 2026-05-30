-- The function calls ensure_user_gamification which INSERTs; STABLE forbids writes.
ALTER FUNCTION public.gam_get_my_state() VOLATILE;