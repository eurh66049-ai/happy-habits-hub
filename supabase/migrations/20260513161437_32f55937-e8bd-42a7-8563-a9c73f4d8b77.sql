ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS paypal_event_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS paypal_capture_id text,
  ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_subscriptions_paypal_capture_id
  ON public.subscriptions(paypal_capture_id);