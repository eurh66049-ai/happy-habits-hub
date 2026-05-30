CREATE POLICY "Users can view their own stories archive"
ON public.stories
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);