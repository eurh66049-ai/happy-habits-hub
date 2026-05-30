
-- Home shuffled list: prefer S3
CREATE OR REPLACE FUNCTION public.get_optimized_books_home_shuffled(p_limit integer DEFAULT 24, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, title text, author text, category text, cover_image_url text, rating numeric, views integer, created_at timestamp with time zone, slug text, language text, page_count integer, book_file_type text, display_type text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        bs.id, bs.title, bs.author, bs.category,
        COALESCE(bs.s3_cover_image_url, bs.cover_image_url) AS cover_image_url,
        COALESCE(bs.rating, 0.0) as rating,
        COALESCE(bs.views, 0) as views,
        bs.created_at, bs.slug, bs.language,
        COALESCE(bs.page_count, 0) as page_count,
        COALESCE(bs.book_file_type, 'pdf') as book_file_type,
        bs.display_type
    FROM book_submissions bs
    WHERE bs.status = 'approved'
    ORDER BY RANDOM()
    LIMIT p_limit OFFSET p_offset;
END;
$function$;

-- Home fast list: join cache with book_submissions to surface s3 url
CREATE OR REPLACE FUNCTION public.get_home_books_fast(p_limit integer DEFAULT 24, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, title text, author text, category text, cover_image_url text, rating numeric, views integer, created_at timestamp with time zone, slug text, language text, page_count integer, book_file_type text, display_type text, total_reviews bigint, average_rating numeric, rating_distribution jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    c.id, c.title, c.author, c.category,
    COALESCE(bs.s3_cover_image_url, c.cover_image_url) AS cover_image_url,
    c.rating, c.views, c.created_at,
    c.slug, c.language, c.page_count, c.book_file_type, c.display_type,
    c.total_reviews, c.average_rating, c.rating_distribution
  FROM public.home_books_cache c
  LEFT JOIN public.book_submissions bs ON bs.id = c.id
  ORDER BY c.shuffle_key
  LIMIT p_limit OFFSET p_offset;
$function$;
