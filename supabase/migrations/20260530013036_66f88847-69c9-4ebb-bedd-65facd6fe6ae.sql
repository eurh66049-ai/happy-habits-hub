
-- =====================================================
-- 1) MYSTERY DROPS
-- =====================================================
CREATE TABLE IF NOT EXISTS public.mystery_drops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  location_kind text NOT NULL CHECK (location_kind IN ('page','book')),
  location_ref text NOT NULL,
  title_ar text NOT NULL,
  message_ar text NOT NULL,
  xp_reward integer NOT NULL DEFAULT 0 CHECK (xp_reward >= 0),
  coins_reward integer NOT NULL DEFAULT 0 CHECK (coins_reward >= 0),
  icon text DEFAULT '💎',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.mystery_drops TO authenticated;
GRANT ALL ON public.mystery_drops TO service_role;

ALTER TABLE public.mystery_drops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active mystery drops are readable by authenticated"
  ON public.mystery_drops FOR SELECT
  TO authenticated
  USING (is_active = true);

-- =====================================================
-- 2) USER MYSTERY DROP CLAIMS
-- =====================================================
CREATE TABLE IF NOT EXISTS public.user_mystery_drop_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  drop_id uuid NOT NULL REFERENCES public.mystery_drops(id) ON DELETE CASCADE,
  xp_awarded integer NOT NULL DEFAULT 0,
  coins_awarded integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, drop_id)
);

CREATE INDEX IF NOT EXISTS idx_mystery_claims_user ON public.user_mystery_drop_claims(user_id, created_at DESC);

GRANT SELECT, INSERT ON public.user_mystery_drop_claims TO authenticated;
GRANT ALL ON public.user_mystery_drop_claims TO service_role;

ALTER TABLE public.user_mystery_drop_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own mystery claims"
  ON public.user_mystery_drop_claims FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- =====================================================
-- 3) WHEEL SPINS
-- =====================================================
CREATE TABLE IF NOT EXISTS public.wheel_spins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  prize_kind text NOT NULL CHECK (prize_kind IN ('coins_small','coins_medium','coins_large','coins_jackpot','featured_book','multiplier')),
  prize_value integer NOT NULL DEFAULT 0,
  prize_label text NOT NULL,
  reference_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wheel_spins_user ON public.wheel_spins(user_id, created_at DESC);

GRANT SELECT ON public.wheel_spins TO authenticated;
GRANT ALL ON public.wheel_spins TO service_role;

ALTER TABLE public.wheel_spins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own wheel spins"
  ON public.wheel_spins FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- =====================================================
-- 4) Column on user_gamification
-- =====================================================
ALTER TABLE public.user_gamification
  ADD COLUMN IF NOT EXISTS last_wheel_spin_date date;

-- =====================================================
-- 5) RPC: claim mystery drop
-- =====================================================
CREATE OR REPLACE FUNCTION public.gam_claim_mystery_drop(_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Already claimed?
  IF EXISTS (SELECT 1 FROM public.user_mystery_drop_claims
             WHERE user_id = v_user AND drop_id = v_drop.id) THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'already_claimed');
  END IF;

  v_xp := v_drop.xp_reward;
  v_coins := v_drop.coins_reward;

  INSERT INTO public.user_mystery_drop_claims (user_id, drop_id, xp_awarded, coins_awarded)
    VALUES (v_user, v_drop.id, v_xp, v_coins);

  -- Ensure gamification row exists
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

  RETURN jsonb_build_object(
    'claimed', true,
    'title_ar', v_drop.title_ar,
    'message_ar', v_drop.message_ar,
    'icon', v_drop.icon,
    'xp_awarded', v_xp,
    'coins_awarded', v_coins
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.gam_claim_mystery_drop(text) TO authenticated;

-- =====================================================
-- 6) RPC: spin daily wheel
-- =====================================================
CREATE OR REPLACE FUNCTION public.gam_spin_daily_wheel()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'UTC')::date;
  v_last date;
  v_roll int;
  v_prize_kind text;
  v_prize_value int := 0;
  v_prize_label text := '';
  v_reference text := NULL;
  v_book_record record;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('spun', false, 'reason', 'not_authenticated');
  END IF;

  INSERT INTO public.user_gamification (user_id)
    VALUES (v_user) ON CONFLICT (user_id) DO NOTHING;

  SELECT last_wheel_spin_date INTO v_last FROM public.user_gamification WHERE user_id = v_user;

  IF v_last = v_today THEN
    RETURN jsonb_build_object('spun', false, 'reason', 'already_spun_today');
  END IF;

  -- Weighted roll 1..100
  v_roll := floor(random() * 100)::int + 1;

  IF v_roll <= 40 THEN
    v_prize_kind := 'coins_small';
    v_prize_value := 10;
    v_prize_label := '10 عملات 🪙';
  ELSIF v_roll <= 65 THEN
    v_prize_kind := 'coins_medium';
    v_prize_value := 50;
    v_prize_label := '50 عملة 🪙';
  ELSIF v_roll <= 80 THEN
    v_prize_kind := 'coins_large';
    v_prize_value := 100;
    v_prize_label := '100 عملة 🪙';
  ELSIF v_roll <= 85 THEN
    v_prize_kind := 'coins_jackpot';
    v_prize_value := 200;
    v_prize_label := 'جائزة كبرى 200 🪙';
  ELSIF v_roll <= 95 THEN
    v_prize_kind := 'featured_book';
    v_prize_value := 0;
    SELECT id::text AS id, title, slug FROM public.approved_books
      WHERE is_active = true ORDER BY random() LIMIT 1
      INTO v_book_record;
    IF v_book_record.id IS NOT NULL THEN
      v_reference := COALESCE(v_book_record.slug, v_book_record.id);
      v_prize_label := 'كتاب مميز: ' || COALESCE(v_book_record.title, 'مختار لك');
    ELSE
      -- fallback to coins
      v_prize_kind := 'coins_medium';
      v_prize_value := 50;
      v_prize_label := '50 عملة 🪙';
    END IF;
  ELSE
    v_prize_kind := 'multiplier';
    v_prize_value := 25; -- compensation coins for now
    v_prize_label := 'مضاعف الحظ +25 🪙';
  END IF;

  -- Award coins if any
  IF v_prize_value > 0 THEN
    UPDATE public.user_gamification
      SET coins = coins + v_prize_value,
          last_wheel_spin_date = v_today,
          updated_at = now()
      WHERE user_id = v_user;
    INSERT INTO public.coins_ledger (user_id, amount, reason, reference_id, metadata)
      VALUES (v_user, v_prize_value, 'daily_wheel'::coins_reason, v_prize_kind,
              jsonb_build_object('prize_label', v_prize_label));
  ELSE
    UPDATE public.user_gamification
      SET last_wheel_spin_date = v_today, updated_at = now()
      WHERE user_id = v_user;
  END IF;

  INSERT INTO public.wheel_spins (user_id, prize_kind, prize_value, prize_label, reference_id)
    VALUES (v_user, v_prize_kind, v_prize_value, v_prize_label, v_reference);

  RETURN jsonb_build_object(
    'spun', true,
    'prize_kind', v_prize_kind,
    'prize_value', v_prize_value,
    'prize_label', v_prize_label,
    'reference_id', v_reference
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.gam_spin_daily_wheel() TO authenticated;

-- =====================================================
-- 7) Seed a few mystery drops
-- =====================================================
INSERT INTO public.mystery_drops (code, location_kind, location_ref, title_ar, message_ar, xp_reward, coins_reward, icon)
VALUES
  ('hidden_shop', 'page', '/shop', 'كنز المتجر 🛍️', 'لقد اكتشفت كنزاً مخفياً في المتجر!', 50, 25, '💰'),
  ('hidden_quotes', 'page', '/quotes', 'كنز الاقتباسات ✨', 'وجدت كنزاً بين الكلمات الجميلة!', 50, 25, '📜'),
  ('hidden_categories', 'page', '/categories', 'كنز التصنيفات 📚', 'كنز خفي بين الأصناف!', 30, 15, '🗝️'),
  ('hidden_leaderboard', 'page', '/leaderboard', 'كنز المتصدرين 🏆', 'كنز نخبة القرّاء!', 80, 40, '👑'),
  ('hidden_authors', 'page', '/authors', 'كنز المؤلفين 🖋️', 'كنز مخفي خلف صفحات المؤلفين!', 40, 20, '💎')
ON CONFLICT (code) DO NOTHING;
