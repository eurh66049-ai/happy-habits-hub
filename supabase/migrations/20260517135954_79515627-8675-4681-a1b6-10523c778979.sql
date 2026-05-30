CREATE OR REPLACE FUNCTION public.get_book_details(p_book_id text)
 RETURNS TABLE(id uuid, user_id uuid, title text, subtitle text, author text, author_bio text, author_image_url text, category text, publisher text, translator text, description text, publication_year integer, page_count integer, language text, display_type text, cover_image_url text, book_file_url text, file_type text, file_size bigint, file_metadata jsonb, rights_confirmation boolean, created_at timestamp with time zone, reviewed_at timestamp with time zone, user_email text, processing_status text, views integer, rating numeric, slug text, is_active boolean)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_uuid boolean := p_book_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
BEGIN
  IF v_is_uuid THEN
    RETURN QUERY
    SELECT bs.id, bs.user_id, bs.title, bs.subtitle, bs.author, bs.author_bio,
      bs.author_image_url, bs.category, bs.publisher, bs.translator,
      bs.description, bs.publication_year, bs.page_count, bs.language,
      bs.display_type,
      public.prefer_s3_url(bs.s3_cover_image_url, bs.cover_image_url),
      public.prefer_s3_url(bs.s3_book_file_url, bs.book_file_url),
      bs.file_type, bs.file_size, bs.file_metadata, bs.rights_confirmation,
      bs.created_at, bs.reviewed_at, bs.user_email, bs.processing_status,
      bs.views, bs.rating, bs.slug, true
    FROM public.book_submissions bs
    WHERE bs.id = p_book_id::uuid AND bs.status = 'approved'
    LIMIT 1;
    IF FOUND THEN RETURN; END IF;
  END IF;

  RETURN QUERY
  SELECT bs.id, bs.user_id, bs.title, bs.subtitle, bs.author, bs.author_bio,
    bs.author_image_url, bs.category, bs.publisher, bs.translator,
    bs.description, bs.publication_year, bs.page_count, bs.language,
    bs.display_type,
    public.prefer_s3_url(bs.s3_cover_image_url, bs.cover_image_url),
    public.prefer_s3_url(bs.s3_book_file_url, bs.book_file_url),
    bs.file_type, bs.file_size, bs.file_metadata, bs.rights_confirmation,
    bs.created_at, bs.reviewed_at, bs.user_email, bs.processing_status,
    bs.views, bs.rating, bs.slug, true
  FROM public.book_submissions bs
  WHERE bs.slug = p_book_id AND bs.status = 'approved'
  LIMIT 1;
  IF FOUND THEN RETURN; END IF;

  RETURN QUERY
  SELECT bs.id, bs.user_id, bs.title, bs.subtitle, bs.author, bs.author_bio,
    bs.author_image_url, bs.category, bs.publisher, bs.translator,
    bs.description, bs.publication_year, bs.page_count, bs.language,
    bs.display_type,
    public.prefer_s3_url(bs.s3_cover_image_url, bs.cover_image_url),
    public.prefer_s3_url(bs.s3_book_file_url, bs.book_file_url),
    bs.file_type, bs.file_size, bs.file_metadata, bs.rights_confirmation,
    bs.created_at, bs.reviewed_at, bs.user_email, bs.processing_status,
    bs.views, bs.rating, bs.slug, true
  FROM public.book_submissions bs
  WHERE bs.status = 'approved'
    AND bs.slug LIKE p_book_id || '-%'
  ORDER BY bs.created_at DESC
  LIMIT 1;
  IF FOUND THEN RETURN; END IF;

  RETURN QUERY
  SELECT bs.id, bs.user_id, bs.title, bs.subtitle, bs.author, bs.author_bio,
    bs.author_image_url, bs.category, bs.publisher, bs.translator,
    bs.description, bs.publication_year, bs.page_count, bs.language,
    bs.display_type,
    public.prefer_s3_url(bs.s3_cover_image_url, bs.cover_image_url),
    public.prefer_s3_url(bs.s3_book_file_url, bs.book_file_url),
    bs.file_type, bs.file_size, bs.file_metadata, bs.rights_confirmation,
    bs.created_at, bs.reviewed_at, bs.user_email, bs.processing_status,
    bs.views, bs.rating, bs.slug, true
  FROM public.book_submissions bs
  WHERE bs.status = 'approved'
    AND lower(replace(bs.slug, '-', '')) = lower(replace(p_book_id, '-', ''))
  ORDER BY bs.created_at DESC
  LIMIT 1;
END;
$function$;

-- Add trigram index to make Arabic prefix LIKE fast (btree LIKE prefix needs C collation, which Arabic slugs lack)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_book_submissions_slug_trgm
  ON public.book_submissions USING gin (slug gin_trgm_ops)
  WHERE status = 'approved';