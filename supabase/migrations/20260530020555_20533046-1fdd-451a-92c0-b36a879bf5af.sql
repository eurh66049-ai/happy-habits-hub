CREATE OR REPLACE FUNCTION public.gam_claim_mystery_drop(_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_drop public.mystery_drops%ROWTYPE;
  v_xp integer := 0;
  v_coins integer := 0;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'not_authenticated');
  END IF;

  SELECT * INTO v_drop FROM public.mystery_drops
    WHERE code = _code AND is_active = true LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'not_found');
  END IF;

  IF EXISTS (SELECT 1 FROM public.user_mystery_drop_claims
             WHERE user_id = v_user AND drop_id = v_drop.id) THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'already_claimed');
  END IF;

  v_xp := v_drop.xp_reward;
  v_coins := v_drop.coins_reward;

  INSERT INTO public.user_mystery_drop_claims (user_id, drop_id, xp_awarded, coins_awarded)
    VALUES (v_user, v_drop.id, v_xp, v_coins);

  INSERT INTO public.user_gamification (user_id)
    VALUES (v_user) ON CONFLICT (user_id) DO NOTHING;

  IF v_xp > 0 THEN
    UPDATE public.user_gamification SET xp = xp + v_xp, updated_at = now()
      WHERE user_id = v_user;
    INSERT INTO public.xp_ledger (user_id, amount, reason, reference_id, metadata)
      VALUES (v_user, v_xp, 'mystery_drop'::xp_reason, v_drop.code,
              jsonb_build_object('drop_id', v_drop.id, 'title', v_drop.title_ar));
  END IF;

  IF v_coins > 0 THEN
    UPDATE public.user_gamification SET coins = coins + v_coins, updated_at = now()
      WHERE user_id = v_user;
    INSERT INTO public.coins_ledger (user_id, amount, reason, reference_id, metadata)
      VALUES (v_user, v_coins, 'mystery_drop'::coins_reason, v_drop.code,
              jsonb_build_object('drop_id', v_drop.id));
  END IF;

  -- إنشاء إشعار في جدول الإشعارات ليظهر للمستخدم في نافذة الإشعارات
  INSERT INTO public.notifications (user_id, title, message, type, target_url, read, is_read)
    VALUES (
      v_user,
      COALESCE(v_drop.icon, '💎') || ' ' || v_drop.title_ar,
      'لقد اكتشفت كنزاً مخفياً في ' || COALESCE(v_drop.location_ref, 'الموقع')
        || E'\n' || COALESCE(v_drop.message_ar, '')
        || E'\nمكافأتك: +' || v_xp || ' XP و +' || v_coins || ' عملة 🪙',
      'mystery_drop',
      COALESCE(v_drop.location_ref, '/rewards'),
      false,
      false
    );

  RETURN jsonb_build_object(
    'claimed', true,
    'title_ar', v_drop.title_ar,
    'message_ar', v_drop.message_ar,
    'icon', v_drop.icon,
    'xp_awarded', v_xp,
    'coins_awarded', v_coins,
    'location_ref', v_drop.location_ref
  );
END;
$function$;