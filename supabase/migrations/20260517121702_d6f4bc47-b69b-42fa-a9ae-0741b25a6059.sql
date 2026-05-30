-- Allow any authenticated user to claim/reassign an FCM token to themselves
-- (a single browser/device can only have one push subscription at a time;
-- the latest signed-in user should own it)

DROP POLICY IF EXISTS "Users can update their own FCM tokens" ON public.fcm_tokens;
DROP POLICY IF EXISTS "Users can insert their own FCM tokens" ON public.fcm_tokens;

CREATE POLICY "Authenticated users can claim FCM tokens"
ON public.fcm_tokens
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Authenticated users can update FCM tokens to own them"
ON public.fcm_tokens
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (auth.uid() = user_id);