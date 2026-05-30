CREATE OR REPLACE FUNCTION public.ensure_book_submission_storage_urls()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  s3_prefix text := 'https://kotobi.s3.eu-north-1.amazonaws.com/';
BEGIN
  IF NEW.cover_image_url ILIKE '%amazonaws.com%' THEN
    NEW.s3_cover_image_url := COALESCE(NEW.s3_cover_image_url, NEW.cover_image_url);
    NEW.cover_image_url := COALESCE(
      NULLIF(NEW.original_cover_image_url, ''),
      'https://kydmyxsgyxeubhmqzrgo.supabase.co/storage/v1/object/public/book-covers/' || regexp_replace(NEW.cover_image_url, '^https://kotobi\.s3\.eu-north-1\.amazonaws\.com/', '')
    );
    NEW.original_cover_image_url := COALESCE(NULLIF(NEW.original_cover_image_url, ''), NEW.cover_image_url);
  END IF;

  IF NEW.book_file_url ILIKE '%amazonaws.com%' THEN
    NEW.s3_book_file_url := COALESCE(NEW.s3_book_file_url, NEW.book_file_url);
    NEW.book_file_url := COALESCE(
      NULLIF(NEW.original_book_file_url, ''),
      'https://kydmyxsgyxeubhmqzrgo.supabase.co/storage/v1/object/public/book-files/' || regexp_replace(NEW.book_file_url, '^https://kotobi\.s3\.eu-north-1\.amazonaws\.com/', '')
    );
    NEW.original_book_file_url := COALESCE(NULLIF(NEW.original_book_file_url, ''), NEW.book_file_url);
  END IF;

  IF (NEW.s3_cover_image_url IS NOT NULL OR NEW.s3_book_file_url IS NOT NULL) AND NEW.s3_migrated_at IS NULL THEN
    NEW.s3_migrated_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_book_submission_storage_urls_trigger ON public.book_submissions;
CREATE TRIGGER ensure_book_submission_storage_urls_trigger
BEFORE INSERT OR UPDATE OF cover_image_url, book_file_url, s3_cover_image_url, s3_book_file_url, original_cover_image_url, original_book_file_url
ON public.book_submissions
FOR EACH ROW
EXECUTE FUNCTION public.ensure_book_submission_storage_urls();

UPDATE public.book_submissions
SET
  s3_cover_image_url = COALESCE(s3_cover_image_url, cover_image_url),
  cover_image_url = COALESCE(
    NULLIF(original_cover_image_url, ''),
    'https://kydmyxsgyxeubhmqzrgo.supabase.co/storage/v1/object/public/book-covers/' || regexp_replace(cover_image_url, '^https://kotobi\.s3\.eu-north-1\.amazonaws\.com/', '')
  ),
  original_cover_image_url = COALESCE(
    NULLIF(original_cover_image_url, ''),
    'https://kydmyxsgyxeubhmqzrgo.supabase.co/storage/v1/object/public/book-covers/' || regexp_replace(cover_image_url, '^https://kotobi\.s3\.eu-north-1\.amazonaws\.com/', '')
  ),
  s3_migrated_at = COALESCE(s3_migrated_at, now())
WHERE cover_image_url ILIKE '%amazonaws.com%';

UPDATE public.book_submissions
SET
  s3_book_file_url = COALESCE(s3_book_file_url, book_file_url),
  book_file_url = COALESCE(
    NULLIF(original_book_file_url, ''),
    'https://kydmyxsgyxeubhmqzrgo.supabase.co/storage/v1/object/public/book-files/' || regexp_replace(book_file_url, '^https://kotobi\.s3\.eu-north-1\.amazonaws\.com/', '')
  ),
  original_book_file_url = COALESCE(
    NULLIF(original_book_file_url, ''),
    'https://kydmyxsgyxeubhmqzrgo.supabase.co/storage/v1/object/public/book-files/' || regexp_replace(book_file_url, '^https://kotobi\.s3\.eu-north-1\.amazonaws\.com/', '')
  ),
  s3_migrated_at = COALESCE(s3_migrated_at, now())
WHERE book_file_url ILIKE '%amazonaws.com%';