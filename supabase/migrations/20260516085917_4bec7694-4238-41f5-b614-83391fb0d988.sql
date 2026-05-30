
ALTER TABLE public.book_submissions
  ADD COLUMN IF NOT EXISTS s3_cover_image_url TEXT,
  ADD COLUMN IF NOT EXISTS s3_book_file_url TEXT;
