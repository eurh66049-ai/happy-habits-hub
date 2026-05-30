UPDATE public.approved_books
SET s3_book_file_url = NULL,
    s3_cover_image_url = NULL,
    s3_migrated_at = NULL
WHERE id = '77a6d6fd-ae2b-4f50-a227-fe329eb6c5b4';