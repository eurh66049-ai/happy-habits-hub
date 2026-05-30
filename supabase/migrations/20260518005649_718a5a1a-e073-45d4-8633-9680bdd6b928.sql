-- مسح أخطاء النقل السابقة (أغلبها كانت مؤقتة: rate limit, 503, 401 قديم)
-- حتى يعود نظام النقل لمحاولتها من جديد
UPDATE book_submissions
SET s3_migration_error = NULL
WHERE status = 'approved'
  AND s3_migration_error IS NOT NULL
  AND (
    (book_file_url ILIKE '%supabase.co%' AND s3_book_file_url IS NULL)
    OR (cover_image_url ILIKE '%supabase.co%' AND s3_cover_image_url IS NULL)
  );