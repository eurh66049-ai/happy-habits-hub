
-- =========================================
-- KOTOBI GAMIFICATION SYSTEM
-- =========================================

-- --- ENUMS ---
DO $$ BEGIN
  CREATE TYPE public.xp_reason AS ENUM (
    'daily_login','reading_activity','finish_book','review','book_like','add_to_shelf',
    'share_quote','daily_tasks_bonus','streak_milestone','admin_adjust'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.coins_reason AS ENUM (
    'daily_login','finish_book','streak_milestone','daily_tasks_bonus',
    'shop_purchase','admin_adjust'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.shop_item_category AS ENUM (
    'name_color','avatar_frame','badge','comment_highlight','profile_background'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.book_completion_method AS ENUM ('auto_95pct','manual','time_based');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.daily_task_code AS ENUM (
    'read_new_book','add_review','add_to_reading_list','share_quote'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- --- HELPER: updated_at ---
CREATE OR REPLACE FUNCTION public.gam_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- =========================================
-- 1) user_gamification
-- =========================================
CREATE TABLE public.user_gamification (
  user_id UUID PRIMARY KEY,
  xp BIGINT NOT NULL DEFAULT 0,
  coins BIGINT NOT NULL DEFAULT 0,
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_active_date DATE,
  last_daily_claim_date DATE,
  selected_name_color TEXT,
  selected_avatar_frame TEXT,
  selected_profile_background TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.user_gamification TO anon;
GRANT SELECT, INSERT, UPDATE ON public.user_gamification TO authenticated;
GRANT ALL ON public.user_gamification TO service_role;
ALTER TABLE public.user_gamification ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ug_select_all" ON public.user_gamification FOR SELECT USING (true);
CREATE POLICY "ug_update_self_cosmetics" ON public.user_gamification FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER ug_touch BEFORE UPDATE ON public.user_gamification
  FOR EACH ROW EXECUTE FUNCTION public.gam_set_updated_at();

-- =========================================
-- 2) xp_ledger
-- =========================================
CREATE TABLE public.xp_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  amount INTEGER NOT NULL,
  reason public.xp_reason NOT NULL,
  reference_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_xp_ledger_user_time ON public.xp_ledger(user_id, created_at DESC);
CREATE INDEX idx_xp_ledger_time ON public.xp_ledger(created_at DESC);
GRANT SELECT ON public.xp_ledger TO authenticated;
GRANT ALL ON public.xp_ledger TO service_role;
ALTER TABLE public.xp_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "xp_ledger_select_self" ON public.xp_ledger FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

-- =========================================
-- 3) coins_ledger
-- =========================================
CREATE TABLE public.coins_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  amount INTEGER NOT NULL, -- + earn, - spend
  reason public.coins_reason NOT NULL,
  reference_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_coins_ledger_user_time ON public.coins_ledger(user_id, created_at DESC);
GRANT SELECT ON public.coins_ledger TO authenticated;
GRANT ALL ON public.coins_ledger TO service_role;
ALTER TABLE public.coins_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coins_ledger_select_self" ON public.coins_ledger FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

-- =========================================
-- 4) book_completions
-- =========================================
CREATE TABLE public.book_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  book_id UUID NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  method public.book_completion_method NOT NULL,
  progress_percentage NUMERIC(5,2),
  reading_seconds INTEGER,
  UNIQUE (user_id, book_id)
);
CREATE INDEX idx_book_completions_user ON public.book_completions(user_id, completed_at DESC);
GRANT SELECT ON public.book_completions TO authenticated;
GRANT ALL ON public.book_completions TO service_role;
ALTER TABLE public.book_completions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bc_select_self" ON public.book_completions FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

-- =========================================
-- 5) daily_tasks (catalog) + user progress
-- =========================================
CREATE TABLE public.daily_tasks (
  code public.daily_task_code PRIMARY KEY,
  title_ar TEXT NOT NULL,
  description_ar TEXT,
  xp_reward INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true
);
GRANT SELECT ON public.daily_tasks TO anon, authenticated;
GRANT ALL ON public.daily_tasks TO service_role;
ALTER TABLE public.daily_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dt_select_all" ON public.daily_tasks FOR SELECT USING (is_active = true);

INSERT INTO public.daily_tasks (code, title_ar, description_ar, xp_reward, sort_order) VALUES
  ('read_new_book','اقرأ كتاباً جديداً','افتح كتاباً لم تقرأه من قبل اليوم',20,1),
  ('add_review','أضف مراجعة','اكتب مراجعة لكتاب قرأته',30,2),
  ('add_to_reading_list','أضف كتاباً إلى قائمة القراءة','أضف كتاباً جديداً إلى مكتبتك',5,3),
  ('share_quote','شارك اقتباساً','شارك اقتباساً من كتاب',10,4);

CREATE TABLE public.user_daily_task_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  task_code public.daily_task_code NOT NULL,
  task_date DATE NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  bonus_awarded BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (user_id, task_code, task_date)
);
CREATE INDEX idx_udtp_user_date ON public.user_daily_task_progress(user_id, task_date DESC);
GRANT SELECT ON public.user_daily_task_progress TO authenticated;
GRANT ALL ON public.user_daily_task_progress TO service_role;
ALTER TABLE public.user_daily_task_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "udtp_select_self" ON public.user_daily_task_progress FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

-- =========================================
-- 6) shop_items + user_shop_purchases
-- =========================================
CREATE TABLE public.shop_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  category public.shop_item_category NOT NULL,
  title_ar TEXT NOT NULL,
  description_ar TEXT,
  price_coins INTEGER NOT NULL CHECK (price_coins >= 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  preview_value TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.shop_items TO anon, authenticated;
GRANT ALL ON public.shop_items TO service_role;
ALTER TABLE public.shop_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shop_items_select" ON public.shop_items FOR SELECT USING (is_active = true);

-- Seed shop
INSERT INTO public.shop_items (code, category, title_ar, description_ar, price_coins, preview_value, sort_order) VALUES
  ('name_gold','name_color','اسم ذهبي','لون ذهبي مميز لاسمك',500,'#D4AF37',1),
  ('name_emerald','name_color','اسم زمرد','لون أخضر زمردي',400,'#10B981',2),
  ('name_ruby','name_color','اسم ياقوتي','لون أحمر ياقوتي',400,'#DC2626',3),
  ('name_sapphire','name_color','اسم ياقوتي أزرق','لون أزرق ساحر',400,'#3B82F6',4),
  ('frame_gold','avatar_frame','إطار ذهبي','إطار ذهبي فاخر لصورتك',800,'gold',10),
  ('frame_neon','avatar_frame','إطار نيون','إطار نيون متوهج',700,'neon',11),
  ('frame_fire','avatar_frame','إطار النار','إطار ناري مذهل',900,'fire',12),
  ('badge_bookworm','badge','شارة دودة الكتب','شارة فخرية لمحبي القراءة',300,'📚',20),
  ('badge_legend','badge','شارة الأسطورة','للأساطير فقط',1500,'👑',21),
  ('highlight_comment','comment_highlight','تمييز التعليق','اجعل تعليقاتك بارزة',600,'highlight',30);

CREATE TABLE public.user_shop_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  shop_item_id UUID NOT NULL REFERENCES public.shop_items(id) ON DELETE CASCADE,
  price_paid INTEGER NOT NULL,
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, shop_item_id)
);
CREATE INDEX idx_usp_user ON public.user_shop_purchases(user_id);
GRANT SELECT ON public.user_shop_purchases TO authenticated;
GRANT ALL ON public.user_shop_purchases TO service_role;
ALTER TABLE public.user_shop_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "usp_select_self" ON public.user_shop_purchases FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

-- =========================================
-- 7) badges + user_badges
-- =========================================
CREATE TABLE public.gam_badges (
  code TEXT PRIMARY KEY,
  title_ar TEXT NOT NULL,
  description_ar TEXT,
  icon TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true
);
GRANT SELECT ON public.gam_badges TO anon, authenticated;
GRANT ALL ON public.gam_badges TO service_role;
ALTER TABLE public.gam_badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gb_select" ON public.gam_badges FOR SELECT USING (is_active = true);

INSERT INTO public.gam_badges (code, title_ar, description_ar, icon, sort_order) VALUES
  ('streak_7','سلسلة 7 أيام','حافظت على سلسلة قراءة لمدة أسبوع','🔥',1),
  ('streak_30','سلسلة 30 يوماً','شهر كامل من القراءة المتواصلة','🌟',2),
  ('streak_100','أسطورة الـ100 يوم','100 يوم متتالي!','👑',3),
  ('first_book','أول كتاب','أنهيت أول كتاب لك','📖',4),
  ('reader_10','قارئ نهم','أنهيت 10 كتب','📚',5),
  ('reviewer_5','ناقد مبتدئ','كتبت 5 مراجعات','✍️',6);

CREATE TABLE public.user_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  badge_code TEXT NOT NULL REFERENCES public.gam_badges(code) ON DELETE CASCADE,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, badge_code)
);
CREATE INDEX idx_user_badges_user ON public.user_badges(user_id);
GRANT SELECT ON public.user_badges TO anon, authenticated;
GRANT ALL ON public.user_badges TO service_role;
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ub_select_all" ON public.user_badges FOR SELECT USING (true);

-- =========================================
-- CORE FUNCTIONS (SECURITY DEFINER)
-- =========================================

-- Ensure user_gamification row exists
CREATE OR REPLACE FUNCTION public.ensure_user_gamification(_user_id UUID)
RETURNS public.user_gamification
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rec public.user_gamification;
BEGIN
  INSERT INTO public.user_gamification(user_id)
  VALUES (_user_id)
  ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO rec FROM public.user_gamification WHERE user_id = _user_id;
  RETURN rec;
END $$;

-- Level computation
CREATE OR REPLACE FUNCTION public.gam_compute_level(_xp BIGINT)
RETURNS JSONB LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  lvl INTEGER; name TEXT; lo BIGINT; hi BIGINT;
BEGIN
  IF _xp >= 5000 THEN lvl:=4; name:='أسطورة القراءة'; lo:=5000; hi:=NULL;
  ELSIF _xp >= 2000 THEN lvl:=3; name:='قارئ محترف'; lo:=2000; hi:=5000;
  ELSIF _xp >= 500 THEN lvl:=2; name:='قارئ نشيط'; lo:=500; hi:=2000;
  ELSE lvl:=1; name:='قارئ مبتدئ'; lo:=0; hi:=500;
  END IF;
  RETURN jsonb_build_object('level',lvl,'name',name,'min_xp',lo,'next_xp',hi);
END $$;

-- Award XP (internal)
CREATE OR REPLACE FUNCTION public.award_xp(
  _user_id UUID, _amount INTEGER, _reason public.xp_reason,
  _reference_id TEXT DEFAULT NULL, _metadata JSONB DEFAULT '{}'::jsonb
) RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_xp BIGINT;
BEGIN
  IF _amount = 0 THEN
    SELECT xp INTO new_xp FROM public.user_gamification WHERE user_id=_user_id;
    RETURN COALESCE(new_xp,0);
  END IF;
  PERFORM public.ensure_user_gamification(_user_id);
  INSERT INTO public.xp_ledger(user_id, amount, reason, reference_id, metadata)
  VALUES (_user_id, _amount, _reason, _reference_id, _metadata);
  UPDATE public.user_gamification SET xp = xp + _amount, updated_at = now()
    WHERE user_id = _user_id RETURNING xp INTO new_xp;
  RETURN new_xp;
END $$;

-- Award Coins (internal)
CREATE OR REPLACE FUNCTION public.award_coins(
  _user_id UUID, _amount INTEGER, _reason public.coins_reason,
  _reference_id TEXT DEFAULT NULL, _metadata JSONB DEFAULT '{}'::jsonb
) RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_balance BIGINT;
BEGIN
  PERFORM public.ensure_user_gamification(_user_id);
  IF _amount < 0 THEN
    SELECT coins INTO new_balance FROM public.user_gamification WHERE user_id=_user_id;
    IF new_balance + _amount < 0 THEN
      RAISE EXCEPTION 'insufficient_coins';
    END IF;
  END IF;
  INSERT INTO public.coins_ledger(user_id, amount, reason, reference_id, metadata)
  VALUES (_user_id, _amount, _reason, _reference_id, _metadata);
  UPDATE public.user_gamification SET coins = coins + _amount, updated_at = now()
    WHERE user_id = _user_id RETURNING coins INTO new_balance;
  RETURN new_balance;
END $$;

-- Award badge if not exists
CREATE OR REPLACE FUNCTION public.award_badge(_user_id UUID, _badge_code TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inserted BOOLEAN := false;
BEGIN
  INSERT INTO public.user_badges(user_id, badge_code) VALUES (_user_id, _badge_code)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END $$;

-- Claim daily login
CREATE OR REPLACE FUNCTION public.claim_daily_login(_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  rec public.user_gamification; today DATE := (now() AT TIME ZONE 'UTC')::date;
  new_streak INTEGER; xp_amt INTEGER; coin_amt INTEGER := 5; milestone TEXT := NULL;
BEGIN
  rec := public.ensure_user_gamification(_user_id);
  IF rec.last_daily_claim_date = today THEN
    RETURN jsonb_build_object('claimed', false, 'reason','already_claimed_today',
      'current_streak', rec.current_streak);
  END IF;
  IF rec.last_daily_claim_date = today - INTERVAL '1 day' THEN
    new_streak := rec.current_streak + 1;
  ELSE
    new_streak := 1;
  END IF;
  xp_amt := CASE
    WHEN new_streak >= 30 THEN 300
    WHEN new_streak >= 7 THEN 50
    WHEN new_streak = 3 THEN 20
    WHEN new_streak = 2 THEN 15
    ELSE 10 END;
  IF new_streak >= 30 THEN coin_amt := 100;
  ELSIF new_streak >= 7 THEN coin_amt := 25;
  END IF;
  PERFORM public.award_xp(_user_id, xp_amt, 'daily_login', today::text);
  PERFORM public.award_coins(_user_id, coin_amt, 'daily_login', today::text);
  UPDATE public.user_gamification SET
    current_streak = new_streak,
    longest_streak = GREATEST(longest_streak, new_streak),
    last_daily_claim_date = today,
    last_active_date = today
    WHERE user_id = _user_id;
  IF new_streak = 7 AND public.award_badge(_user_id,'streak_7') THEN milestone:='streak_7'; END IF;
  IF new_streak = 30 AND public.award_badge(_user_id,'streak_30') THEN milestone:='streak_30'; END IF;
  IF new_streak = 100 AND public.award_badge(_user_id,'streak_100') THEN milestone:='streak_100'; END IF;
  RETURN jsonb_build_object(
    'claimed', true, 'xp_awarded', xp_amt, 'coins_awarded', coin_amt,
    'new_streak', new_streak, 'milestone_badge', milestone
  );
END $$;

-- Finish book (idempotent)
CREATE OR REPLACE FUNCTION public.award_finish_book(
  _user_id UUID, _book_id UUID, _method public.book_completion_method,
  _progress NUMERIC DEFAULT NULL, _seconds INTEGER DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inserted BOOLEAN; total_books INTEGER;
BEGIN
  INSERT INTO public.book_completions(user_id, book_id, method, progress_percentage, reading_seconds)
  VALUES (_user_id, _book_id, _method, _progress, _seconds)
  ON CONFLICT (user_id, book_id) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  IF NOT inserted THEN
    RETURN jsonb_build_object('awarded', false, 'reason','already_completed');
  END IF;
  PERFORM public.award_xp(_user_id, 100, 'finish_book', _book_id::text);
  PERFORM public.award_coins(_user_id, 20, 'finish_book', _book_id::text);
  SELECT COUNT(*) INTO total_books FROM public.book_completions WHERE user_id=_user_id;
  IF total_books = 1 THEN PERFORM public.award_badge(_user_id,'first_book'); END IF;
  IF total_books = 10 THEN PERFORM public.award_badge(_user_id,'reader_10'); END IF;
  RETURN jsonb_build_object('awarded', true, 'xp_awarded',100,'coins_awarded',20,'total_books',total_books);
END $$;

-- Daily reading activity (one award per book per day)
CREATE OR REPLACE FUNCTION public.award_reading_activity(_user_id UUID, _book_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE today DATE := (now() AT TIME ZONE 'UTC')::date; already_today INTEGER;
BEGIN
  SELECT COUNT(*) INTO already_today FROM public.xp_ledger
    WHERE user_id=_user_id AND reason='reading_activity'
      AND reference_id = _book_id::text
      AND created_at::date = today;
  IF already_today > 0 THEN
    RETURN jsonb_build_object('awarded', false, 'reason','already_today');
  END IF;
  PERFORM public.award_xp(_user_id, 20, 'reading_activity', _book_id::text);
  UPDATE public.user_gamification SET last_active_date=today WHERE user_id=_user_id;
  RETURN jsonb_build_object('awarded', true, 'xp_awarded', 20);
END $$;

-- Generic daily task completion
CREATE OR REPLACE FUNCTION public.complete_daily_task(
  _user_id UUID, _task_code public.daily_task_code
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  today DATE := (now() AT TIME ZONE 'UTC')::date;
  task public.daily_tasks; inserted BOOLEAN := false;
  done_today INTEGER; bonus_already BOOLEAN; bonus_xp INTEGER := 0;
BEGIN
  SELECT * INTO task FROM public.daily_tasks WHERE code=_task_code AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'task_not_found'; END IF;
  PERFORM public.ensure_user_gamification(_user_id);
  INSERT INTO public.user_daily_task_progress(user_id, task_code, task_date)
  VALUES (_user_id, _task_code, today)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  IF inserted AND task.xp_reward > 0 THEN
    PERFORM public.award_xp(_user_id, task.xp_reward,
      CASE _task_code
        WHEN 'add_review' THEN 'review'::public.xp_reason
        WHEN 'read_new_book' THEN 'reading_activity'::public.xp_reason
        WHEN 'add_to_reading_list' THEN 'add_to_shelf'::public.xp_reason
        WHEN 'share_quote' THEN 'share_quote'::public.xp_reason
      END, _task_code::text);
  END IF;
  SELECT COUNT(*) INTO done_today FROM public.user_daily_task_progress
    WHERE user_id=_user_id AND task_date=today;
  SELECT COALESCE(bool_or(bonus_awarded),false) INTO bonus_already
    FROM public.user_daily_task_progress WHERE user_id=_user_id AND task_date=today;
  IF done_today >= 3 AND NOT bonus_already THEN
    bonus_xp := 50;
    PERFORM public.award_xp(_user_id, 50, 'daily_tasks_bonus', today::text);
    UPDATE public.user_daily_task_progress SET bonus_awarded=true
      WHERE user_id=_user_id AND task_date=today;
  END IF;
  RETURN jsonb_build_object('newly_completed', inserted,
    'tasks_done_today', done_today, 'bonus_xp_awarded', bonus_xp);
END $$;

-- Shop purchase (atomic)
CREATE OR REPLACE FUNCTION public.purchase_shop_item(_user_id UUID, _item_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE item public.shop_items; balance BIGINT;
BEGIN
  SELECT * INTO item FROM public.shop_items WHERE id=_item_id AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'item_not_found'; END IF;
  PERFORM public.ensure_user_gamification(_user_id);
  IF EXISTS (SELECT 1 FROM public.user_shop_purchases WHERE user_id=_user_id AND shop_item_id=_item_id) THEN
    RAISE EXCEPTION 'already_owned';
  END IF;
  SELECT coins INTO balance FROM public.user_gamification WHERE user_id=_user_id;
  IF balance < item.price_coins THEN RAISE EXCEPTION 'insufficient_coins'; END IF;
  PERFORM public.award_coins(_user_id, -item.price_coins, 'shop_purchase', item.code);
  INSERT INTO public.user_shop_purchases(user_id, shop_item_id, price_paid)
    VALUES (_user_id, _item_id, item.price_coins);
  RETURN jsonb_build_object('purchased', true, 'item_code', item.code,
    'price_paid', item.price_coins);
END $$;

-- Trigger: auto-award on review insert
CREATE OR REPLACE FUNCTION public.trg_review_award_xp()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    PERFORM public.complete_daily_task(NEW.user_id, 'add_review');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS book_reviews_award_xp ON public.book_reviews;
CREATE TRIGGER book_reviews_award_xp AFTER INSERT ON public.book_reviews
  FOR EACH ROW EXECUTE FUNCTION public.trg_review_award_xp();

-- Trigger: auto-award on like insert
CREATE OR REPLACE FUNCTION public.trg_like_award_xp()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE today_count INTEGER;
BEGIN
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
  SELECT COUNT(*) INTO today_count FROM public.xp_ledger
    WHERE user_id=NEW.user_id AND reason='book_like'
      AND created_at::date = (now() AT TIME ZONE 'UTC')::date;
  IF today_count < 10 THEN
    PERFORM public.award_xp(NEW.user_id, 5, 'book_like', NEW.book_id::text);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS book_likes_award_xp ON public.book_likes;
CREATE TRIGGER book_likes_award_xp AFTER INSERT ON public.book_likes
  FOR EACH ROW EXECUTE FUNCTION public.trg_like_award_xp();

-- Grants on functions
GRANT EXECUTE ON FUNCTION public.ensure_user_gamification(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gam_compute_level(BIGINT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_daily_login(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.award_finish_book(UUID, UUID, public.book_completion_method, NUMERIC, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.award_reading_activity(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_daily_task(UUID, public.daily_task_code) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.purchase_shop_item(UUID, UUID) TO authenticated, service_role;
