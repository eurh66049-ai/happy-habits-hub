
WITH batch AS (
  SELECT id FROM public.book_submissions
  WHERE cover_image_url ILIKE '%amazonaws%' AND s3_cover_image_url IS NULL
  LIMIT 4000
)
UPDATE public.book_submissions b
SET
  s3_cover_image_url = b.cover_image_url,
  cover_image_url = COALESCE(
    b.original_cover_image_url,
    'https://kydmyxsgyxeubhmqzrgo.supabase.co/storage/v1/object/public/book-covers/'
      || regexp_replace(b.cover_image_url, '^https://kotobi\.s3\.eu-north-1\.amazonaws\.com/', '')
  )
FROM batch
WHERE b.id = batch.id;
