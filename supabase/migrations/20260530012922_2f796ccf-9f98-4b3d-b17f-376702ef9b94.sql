
-- 1) Extend enums
ALTER TYPE public.xp_reason ADD VALUE IF NOT EXISTS 'mystery_drop';
ALTER TYPE public.xp_reason ADD VALUE IF NOT EXISTS 'daily_wheel';
ALTER TYPE public.coins_reason ADD VALUE IF NOT EXISTS 'mystery_drop';
ALTER TYPE public.coins_reason ADD VALUE IF NOT EXISTS 'daily_wheel';
