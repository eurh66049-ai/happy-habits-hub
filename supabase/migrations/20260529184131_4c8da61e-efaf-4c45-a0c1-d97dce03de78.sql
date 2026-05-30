
-- Revoke direct execute on internal functions from authenticated (keep service_role)
REVOKE EXECUTE ON FUNCTION public.claim_daily_login(UUID) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.award_finish_book(UUID, UUID, public.book_completion_method, NUMERIC, INTEGER) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.award_reading_activity(UUID, UUID) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_daily_task(UUID, public.daily_task_code) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.purchase_shop_item(UUID, UUID) FROM authenticated;

-- Wrapper: claim_daily_login_self
CREATE OR REPLACE FUNCTION public.gam_claim_daily_login()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  RETURN public.claim_daily_login(uid);
END $$;

CREATE OR REPLACE FUNCTION public.gam_award_finish_book(
  _book_id UUID,
  _method public.book_completion_method DEFAULT 'auto_95pct',
  _progress NUMERIC DEFAULT NULL,
  _seconds INTEGER DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  RETURN public.award_finish_book(uid, _book_id, _method, _progress, _seconds);
END $$;

CREATE OR REPLACE FUNCTION public.gam_award_reading_activity(_book_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  RETURN public.award_reading_activity(uid, _book_id);
END $$;

CREATE OR REPLACE FUNCTION public.gam_complete_daily_task(_task_code public.daily_task_code)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  RETURN public.complete_daily_task(uid, _task_code);
END $$;

CREATE OR REPLACE FUNCTION public.gam_purchase_shop_item(_item_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  RETURN public.purchase_shop_item(uid, _item_id);
END $$;

-- Get full gamification state for current user
CREATE OR REPLACE FUNCTION public.gam_get_my_state()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE AS $$
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
    'daily_tasks', daily_tasks_arr,
    'daily_tasks_completed', done_today,
    'badges', badges_arr,
    'purchases', purchases_arr
  );
END $$;

-- Leaderboard (weekly/monthly/alltime)
CREATE OR REPLACE FUNCTION public.gam_get_leaderboard(_period TEXT DEFAULT 'week', _limit INTEGER DEFAULT 50)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE AS $$
DECLARE since TIMESTAMPTZ; result JSONB;
BEGIN
  since := CASE _period
    WHEN 'week' THEN now() - INTERVAL '7 days'
    WHEN 'month' THEN now() - INTERVAL '30 days'
    ELSE '1970-01-01'::timestamptz
  END;
  IF _period = 'alltime' THEN
    SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.total_xp DESC), '[]'::jsonb) INTO result
    FROM (
      SELECT ug.user_id, ug.xp AS total_xp, ug.current_streak,
        p.username, p.avatar_url, ug.selected_name_color, ug.selected_avatar_frame
      FROM public.user_gamification ug
      LEFT JOIN public.profiles p ON p.id = ug.user_id
      ORDER BY ug.xp DESC
      LIMIT _limit
    ) t;
  ELSE
    SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.total_xp DESC), '[]'::jsonb) INTO result
    FROM (
      SELECT l.user_id, SUM(l.amount)::BIGINT AS total_xp,
        ug.current_streak, p.username, p.avatar_url,
        ug.selected_name_color, ug.selected_avatar_frame
      FROM public.xp_ledger l
      LEFT JOIN public.profiles p ON p.id = l.user_id
      LEFT JOIN public.user_gamification ug ON ug.user_id = l.user_id
      WHERE l.created_at >= since AND l.amount > 0
      GROUP BY l.user_id, ug.current_streak, p.username, p.avatar_url,
        ug.selected_name_color, ug.selected_avatar_frame
      ORDER BY total_xp DESC
      LIMIT _limit
    ) t;
  END IF;
  RETURN COALESCE(result, '[]'::jsonb);
END $$;

-- Select cosmetic (must own)
CREATE OR REPLACE FUNCTION public.gam_select_cosmetic(_item_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  END IF;
  RETURN jsonb_build_object('selected', true, 'category', item.category, 'value', item.preview_value);
END $$;

-- Clear cosmetic
CREATE OR REPLACE FUNCTION public.gam_clear_cosmetic(_category public.shop_item_category)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  END IF;
  RETURN jsonb_build_object('cleared', true);
END $$;

-- Grants on wrappers
GRANT EXECUTE ON FUNCTION public.gam_claim_daily_login() TO authenticated;
GRANT EXECUTE ON FUNCTION public.gam_award_finish_book(UUID, public.book_completion_method, NUMERIC, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gam_award_reading_activity(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gam_complete_daily_task(public.daily_task_code) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gam_purchase_shop_item(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gam_get_my_state() TO authenticated;
GRANT EXECUTE ON FUNCTION public.gam_get_leaderboard(TEXT, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gam_select_cosmetic(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gam_clear_cosmetic(public.shop_item_category) TO authenticated;
