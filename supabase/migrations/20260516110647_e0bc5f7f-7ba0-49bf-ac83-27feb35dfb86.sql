CREATE OR REPLACE FUNCTION public.prefer_s3_url(p_s3_url text, p_fallback_url text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(NULLIF(btrim(p_s3_url), ''), NULLIF(btrim(p_fallback_url), ''))
$$;

CREATE OR REPLACE FUNCTION public.get_approved_books_with_pagination(p_limit integer DEFAULT 24, p_offset integer DEFAULT 0)
RETURNS TABLE(
  id text,
  title text,
  author text,
  category text,
  description text,
  cover_image text,
  book_type text,
  views integer,
  rating numeric,
  is_free boolean,
  created_at timestamp with time zone,
  slug text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    bs.id::text,
    bs.title,
    bs.author,
    bs.category,
    bs.description,
    public.prefer_s3_url(bs.s3_cover_image_url, bs.cover_image_url) AS cover_image,
    'uploaded'::text as book_type,
    bs.views,
    bs.rating,
    true as is_free,
    bs.created_at,
    bs.slug
  FROM public.book_submissions bs
  WHERE bs.status = 'approved'
  ORDER BY bs.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_book_details(p_book_id text)
RETURNS TABLE(
  id uuid,
  user_id uuid,
  title text,
  subtitle text,
  author text,
  author_bio text,
  author_image_url text,
  category text,
  publisher text,
  translator text,
  description text,
  publication_year integer,
  page_count integer,
  language text,
  display_type text,
  cover_image_url text,
  book_file_url text,
  file_type text,
  file_size bigint,
  file_metadata jsonb,
  rights_confirmation boolean,
  created_at timestamp with time zone,
  reviewed_at timestamp with time zone,
  user_email text,
  processing_status text,
  views integer,
  rating numeric,
  slug text,
  is_active boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    bs.id, bs.user_id, bs.title, bs.subtitle, bs.author, bs.author_bio,
    bs.author_image_url, bs.category, bs.publisher, bs.translator,
    bs.description, bs.publication_year, bs.page_count, bs.language,
    bs.display_type,
    public.prefer_s3_url(bs.s3_cover_image_url, bs.cover_image_url) AS cover_image_url,
    public.prefer_s3_url(bs.s3_book_file_url, bs.book_file_url) AS book_file_url,
    bs.file_type,
    bs.file_size, bs.file_metadata, bs.rights_confirmation, bs.created_at,
    bs.reviewed_at, bs.user_email, bs.processing_status, bs.views,
    bs.rating, bs.slug, true as is_active
  FROM public.book_submissions bs
  WHERE (
      bs.slug = p_book_id
      OR bs.id::text = p_book_id
      OR lower(replace(bs.slug, '-', '')) = lower(replace(p_book_id, '-', ''))
      OR bs.slug LIKE p_book_id || '-%'
      OR lower(replace(bs.slug, '-', '')) LIKE lower(replace(p_book_id, '-', '')) || '%'
    )
    AND bs.status = 'approved'
  ORDER BY
    (bs.slug = p_book_id) DESC,
    (bs.id::text = p_book_id) DESC,
    (bs.slug LIKE p_book_id || '-%') DESC,
    bs.created_at DESC
  LIMIT 1;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_home_books_fast(p_limit integer DEFAULT 24, p_offset integer DEFAULT 0)
RETURNS TABLE(
  id uuid,
  title text,
  author text,
  category text,
  cover_image_url text,
  rating numeric,
  views integer,
  created_at timestamp with time zone,
  slug text,
  language text,
  page_count integer,
  book_file_type text,
  display_type text,
  total_reviews bigint,
  average_rating numeric,
  rating_distribution jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    c.id, c.title, c.author, c.category,
    public.prefer_s3_url(bs.s3_cover_image_url, c.cover_image_url) AS cover_image_url,
    c.rating, c.views, c.created_at,
    c.slug, c.language, c.page_count, c.book_file_type, c.display_type,
    c.total_reviews, c.average_rating, c.rating_distribution
  FROM public.home_books_cache c
  LEFT JOIN public.book_submissions bs ON bs.id = c.id
  ORDER BY c.shuffle_key
  LIMIT p_limit OFFSET p_offset;
$function$;