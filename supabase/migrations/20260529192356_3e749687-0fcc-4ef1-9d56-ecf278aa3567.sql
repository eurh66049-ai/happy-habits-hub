ALTER TABLE public.user_gamification
ADD COLUMN IF NOT EXISTS selected_badge TEXT,
ADD COLUMN IF NOT EXISTS selected_comment_highlight TEXT;

CREATE OR REPLACE FUNCTION public.gam_get_my_state()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid UUID := auth.uid(); ug public.user_gamification;
  today DATE := (now() AT TIME ZONE 'UTC')::date;
  level_info JSONB; daily_tasks_arr JSONB; done_today JSONB; badges_arr JSONB;
  purchases_arr JSONB; can_claim BOOLEAN;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  ug := public.ensure_user_gamification(uid);
  level_info := public.gam_compute_level(ug.xp);
  can_claim := COALESCE(ug.last_daily_claim_date, '1970-01-01'::date) < today;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'code',code,'title_ar',title_ar,'description_ar',description_ar,
    'xp_reward',xp_reward,'sort_order',sort_order)
    ORDER BY sort_order), '[]'::jsonb)
  INTO daily_tasks_arr FROM public.daily_tasks WHERE is_active;

  SELECT COALESCE(jsonb_agg(task_code), '[]'::jsonb) INTO done_today
  FROM public.user_daily_task_progress
  WHERE user_id=uid AND task_date=today;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'code',b.code,'title_ar',b.title_ar,'description_ar',b.description_ar,
    'icon',b.icon,'awarded_at',ub.awarded_at)), '[]'::jsonb)
  INTO badges_arr
  FROM public.user_badges ub JOIN public.gam_badges b ON b.code=ub.badge_code
  WHERE ub.user_id=uid;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'item_id', si.id, 'code', si.code, 'category', si.category,
    'title_ar', si.title_ar, 'preview_value', si.preview_value,
    'purchased_at', usp.purchased_at)), '[]'::jsonb)
  INTO purchases_arr
  FROM public.user_shop_purchases usp
  JOIN public.shop_items si ON si.id = usp.shop_item_id
  WHERE usp.user_id = uid;

  RETURN jsonb_build_object(
    'user_id', uid,
    'xp', ug.xp, 'coins', ug.coins,
    'level', level_info,
    'current_streak', ug.current_streak,
    'longest_streak', ug.longest_streak,
    'last_daily_claim_date', ug.last_daily_claim_date,
    'can_claim_daily', can_claim,
    'selected_name_color', ug.selected_name_color,
    'selected_avatar_frame', ug.selected_avatar_frame,
    'selected_profile_background', ug.selected_profile_background,
    'selected_badge', ug.selected_badge,
    'selected_comment_highlight', ug.selected_comment_highlight,
    'daily_tasks', daily_tasks_arr,
    'daily_tasks_completed', done_today,
    'badges', badges_arr,
    'purchases', purchases_arr
  );
END $function$;

CREATE OR REPLACE FUNCTION public.gam_select_cosmetic(_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid UUID := auth.uid(); item public.shop_items;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO item FROM public.shop_items WHERE id=_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'item_not_found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_shop_purchases
    WHERE user_id=uid AND shop_item_id=_item_id) THEN
    RAISE EXCEPTION 'not_owned';
  END IF;
  PERFORM public.ensure_user_gamification(uid);
  IF item.category='name_color' THEN
    UPDATE public.user_gamification SET selected_name_color = item.preview_value WHERE user_id=uid;
  ELSIF item.category='avatar_frame' THEN
    UPDATE public.user_gamification SET selected_avatar_frame = item.preview_value WHERE user_id=uid;
  ELSIF item.category='profile_background' THEN
    UPDATE public.user_gamification SET selected_profile_background = item.preview_value WHERE user_id=uid;
  ELSIF item.category='badge' THEN
    UPDATE public.user_gamification SET selected_badge = item.preview_value WHERE user_id=uid;
  ELSIF item.category='comment_highlight' THEN
    UPDATE public.user_gamification SET selected_comment_highlight = item.preview_value WHERE user_id=uid;
  END IF;
  RETURN jsonb_build_object('selected', true, 'category', item.category, 'value', item.preview_value);
END $function$;

CREATE OR REPLACE FUNCTION public.gam_clear_cosmetic(_category shop_item_category)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  PERFORM public.ensure_user_gamification(uid);
  IF _category='name_color' THEN
    UPDATE public.user_gamification SET selected_name_color=NULL WHERE user_id=uid;
  ELSIF _category='avatar_frame' THEN
    UPDATE public.user_gamification SET selected_avatar_frame=NULL WHERE user_id=uid;
  ELSIF _category='profile_background' THEN
    UPDATE public.user_gamification SET selected_profile_background=NULL WHERE user_id=uid;
  ELSIF _category='badge' THEN
    UPDATE public.user_gamification SET selected_badge=NULL WHERE user_id=uid;
  ELSIF _category='comment_highlight' THEN
    UPDATE public.user_gamification SET selected_comment_highlight=NULL WHERE user_id=uid;
  END IF;
  RETURN jsonb_build_object('cleared', true);
END $function$;

CREATE OR REPLACE FUNCTION public.purchase_shop_item(_user_id uuid, _item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  ug public.user_gamification;
  item public.shop_items;
BEGIN
  ug := public.ensure_user_gamification(_user_id);

  SELECT * INTO item FROM public.shop_items WHERE id=_item_id AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'item_not_found'; END IF;

  IF EXISTS (SELECT 1 FROM public.user_shop_purchases WHERE user_id=_user_id AND shop_item_id=_item_id) THEN
    RAISE EXCEPTION 'already_owned';
  END IF;

  IF ug.coins < item.price_coins THEN
    RAISE EXCEPTION 'insufficient_coins';
  END IF;

  UPDATE public.user_gamification
  SET coins = coins - item.price_coins,
      selected_name_color = CASE WHEN item.category='name_color' THEN item.preview_value ELSE selected_name_color END,
      selected_avatar_frame = CASE WHEN item.category='avatar_frame' THEN item.preview_value ELSE selected_avatar_frame END,
      selected_profile_background = CASE WHEN item.category='profile_background' THEN item.preview_value ELSE selected_profile_background END,
      selected_badge = CASE WHEN item.category='badge' THEN item.preview_value ELSE selected_badge END,
      selected_comment_highlight = CASE WHEN item.category='comment_highlight' THEN item.preview_value ELSE selected_comment_highlight END
  WHERE user_id=_user_id;

  INSERT INTO public.user_shop_purchases(user_id, shop_item_id, price_paid)
  VALUES (_user_id, _item_id, item.price_coins);

  RETURN jsonb_build_object('purchased', true, 'item_code', item.code, 'price_paid', item.price_coins);
END $function$;

DROP FUNCTION IF EXISTS public.get_book_reviews_with_profiles(text);

CREATE OR REPLACE FUNCTION public.get_book_reviews_with_profiles(p_book_id text)
RETURNS TABLE(
  id uuid,
  book_id uuid,
  user_id uuid,
  rating integer,
  comment text,
  recommend boolean,
  created_at timestamp with time zone,
  username text,
  avatar_url text,
  user_email text,
  selected_name_color text,
  selected_avatar_frame text,
  selected_badge text,
  selected_comment_highlight text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_book_uuid UUID;
BEGIN
  v_book_uuid := public.book_id_to_uuid(p_book_id);

  RETURN QUERY 
  SELECT 
    br.id,
    br.book_id,
    br.user_id,
    br.rating,
    br.comment,
    br.recommend,
    br.created_at,
    COALESCE(p.username, p.email, 'مستخدم مجهول') as username,
    p.avatar_url,
    p.email as user_email,
    ug.selected_name_color,
    ug.selected_avatar_frame,
    ug.selected_badge,
    ug.selected_comment_highlight
  FROM public.book_reviews br
  LEFT JOIN public.profiles p ON br.user_id = p.id
  LEFT JOIN public.user_gamification ug ON ug.user_id = br.user_id
  WHERE br.book_id = v_book_uuid
  ORDER BY br.created_at DESC;
END;
$function$;