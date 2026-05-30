-- Trigger: notify user when they receive XP
CREATE OR REPLACE FUNCTION public.trg_notify_xp_award()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reason_ar TEXT;
BEGIN
  IF NEW.amount IS NULL OR NEW.amount <= 0 THEN
    RETURN NEW;
  END IF;

  reason_ar := CASE NEW.reason::text
    WHEN 'daily_login'        THEN 'مكافأة الدخول اليومي'
    WHEN 'reading_activity'   THEN 'نشاط قراءة'
    WHEN 'finish_book'        THEN 'إنهاء كتاب'
    WHEN 'review'             THEN 'إضافة مراجعة'
    WHEN 'book_like'          THEN 'إعجاب على كتابك'
    WHEN 'add_to_shelf'       THEN 'إضافة كتاب للمفضلة'
    WHEN 'share_quote'        THEN 'مشاركة اقتباس'
    WHEN 'daily_tasks_bonus'  THEN 'إكمال المهام اليومية'
    WHEN 'streak_milestone'   THEN 'إنجاز سلسلة الأيام'
    WHEN 'admin_adjust'       THEN 'تعديل من الإدارة'
    ELSE 'مكافأة'
  END;

  INSERT INTO public.notifications (user_id, title, message, type, target_url)
  VALUES (
    NEW.user_id,
    '+' || NEW.amount || ' نقطة خبرة 🎉',
    'حصلت على ' || NEW.amount || ' XP — السبب: ' || reason_ar || '.',
    'reward_xp',
    '/rewards'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_xp_award ON public.xp_ledger;
CREATE TRIGGER notify_xp_award
AFTER INSERT ON public.xp_ledger
FOR EACH ROW EXECUTE FUNCTION public.trg_notify_xp_award();

-- Trigger: notify user when they receive Kotobi Coins (positive only)
CREATE OR REPLACE FUNCTION public.trg_notify_coins_award()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reason_ar TEXT;
BEGIN
  IF NEW.amount IS NULL OR NEW.amount <= 0 THEN
    RETURN NEW;
  END IF;

  reason_ar := CASE NEW.reason::text
    WHEN 'daily_login'        THEN 'مكافأة الدخول اليومي'
    WHEN 'finish_book'        THEN 'إنهاء كتاب'
    WHEN 'streak_milestone'   THEN 'إنجاز سلسلة الأيام'
    WHEN 'daily_tasks_bonus'  THEN 'إكمال المهام اليومية'
    WHEN 'admin_adjust'       THEN 'تعديل من الإدارة'
    ELSE 'مكافأة'
  END;

  INSERT INTO public.notifications (user_id, title, message, type, target_url)
  VALUES (
    NEW.user_id,
    '+' || NEW.amount || ' عملة كتبي 🪙',
    'حصلت على ' || NEW.amount || ' Kotobi Coins — السبب: ' || reason_ar || '.',
    'reward_coins',
    '/rewards'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_coins_award ON public.coins_ledger;
CREATE TRIGGER notify_coins_award
AFTER INSERT ON public.coins_ledger
FOR EACH ROW EXECUTE FUNCTION public.trg_notify_coins_award();