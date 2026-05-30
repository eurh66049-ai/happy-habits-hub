UPDATE public.book_submissions b
SET original_cover_image_url = b.cover_image_url
FROM (
  SELECT id FROM public.book_submissions
  WHERE original_cover_image_url IS NULL AND cover_image_url LIKE '%supabase.co%'
  LIMIT 500
) s
WHERE b.id = s.id;