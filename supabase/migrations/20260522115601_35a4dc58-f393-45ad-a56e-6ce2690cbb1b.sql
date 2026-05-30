DELETE FROM public.bulk_upload_queue
WHERE coalesce(book_file_url, '') ILIKE '%archive.org%'
   OR coalesce(cover_image_url, '') ILIKE '%archive.org%'
   OR coalesce(created_by_email, '') IN ('auto-discover@kotobi.local', 'auto-discover-ai@kotobi.local');

UPDATE public.auto_discover_config
SET cursor = NULL,
    current_query_index = 0,
    batch_size = GREATEST(coalesce(batch_size, 100), 100),
    min_pending_threshold = 0,
    last_run_at = now(),
    last_status = 'تم تنظيف طابور Archive.org وإعادة البداية مع منع تكرار أقوى',
    last_error = NULL
WHERE id = 1;