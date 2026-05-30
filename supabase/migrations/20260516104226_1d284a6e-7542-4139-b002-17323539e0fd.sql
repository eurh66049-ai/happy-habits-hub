CREATE OR REPLACE FUNCTION public.get_approved_books_with_pagination(p_limit integer DEFAULT 24, p_offset integer DEFAULT 0)
 RETURNS TABLE(id text, title text, author text, category text, description text, cover_image text, book_type text, views integer, rating numeric, is_free boolean, created_at timestamp with time zone, slug text)
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
    COALESCE(bs.s3_cover_image_url, bs.cover_image_url) AS cover_image,
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