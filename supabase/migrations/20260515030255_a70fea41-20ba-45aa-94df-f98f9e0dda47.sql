ALTER TABLE public.book_submissions
  ADD COLUMN IF NOT EXISTS s3_migrated_at timestamptz,
  ADD COLUMN IF NOT EXISTS s3_migration_error text,
  ADD COLUMN IF NOT EXISTS original_book_file_url text,
  ADD COLUMN IF NOT EXISTS original_cover_image_url text;

CREATE INDEX IF NOT EXISTS idx_book_submissions_s3_pending
  ON public.book_submissions (created_at DESC)
  WHERE s3_migrated_at IS NULL AND status = 'approved';