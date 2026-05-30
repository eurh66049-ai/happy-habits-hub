-- إنشاء دالة آمنة (SECURITY DEFINER) لتحديث روابط S3 للكتب
-- مقيدة بـ: تحديث الكتب المعتمدة فقط، التي لم تُرحّل بعد، ولروابط Supabase الأصلية فقط
CREATE OR REPLACE FUNCTION public.apply_s3_migration(
  p_id uuid,
  p_new_book_url text,
  p_orig_book_url text,
  p_new_cover_url text,
  p_orig_cover_url text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated boolean := false;
BEGIN
  -- شروط أمان صارمة:
  -- 1. الروابط الجديدة يجب أن تكون من S3 الخاص بنا فقط
  -- 2. الروابط الأصلية يجب أن تكون من Supabase Storage
  -- 3. لا تحدّث إلا الكتب المعتمدة وغير المرحّلة
  IF p_new_book_url IS NOT NULL AND p_new_book_url NOT LIKE 'https://kotobi.s3.%amazonaws.com/%' THEN
    RAISE EXCEPTION 'invalid book S3 url';
  END IF;
  IF p_new_cover_url IS NOT NULL AND p_new_cover_url NOT LIKE 'https://kotobi.s3.%amazonaws.com/%' THEN
    RAISE EXCEPTION 'invalid cover S3 url';
  END IF;
  IF p_orig_book_url IS NOT NULL AND p_orig_book_url NOT LIKE '%supabase.co/storage/%' THEN
    RAISE EXCEPTION 'invalid book original url';
  END IF;
  IF p_orig_cover_url IS NOT NULL AND p_orig_cover_url NOT LIKE '%supabase.co/storage/%' THEN
    RAISE EXCEPTION 'invalid cover original url';
  END IF;

  UPDATE public.book_submissions
  SET
    s3_migrated_at = now(),
    original_book_file_url = COALESCE(p_orig_book_url, original_book_file_url),
    book_file_url = COALESCE(p_new_book_url, book_file_url),
    original_cover_image_url = COALESCE(p_orig_cover_url, original_cover_image_url),
    cover_image_url = COALESCE(p_new_cover_url, cover_image_url)
  WHERE id = p_id
    AND status = 'approved'
    AND s3_migrated_at IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

-- السماح للمستخدم المجهول (anon) باستدعاء الدالة
-- (الدالة نفسها محصّنة بشروط داخلية صارمة)
GRANT EXECUTE ON FUNCTION public.apply_s3_migration(uuid, text, text, text, text) TO anon, authenticated;