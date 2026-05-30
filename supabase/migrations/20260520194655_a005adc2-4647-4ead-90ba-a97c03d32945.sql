CREATE OR REPLACE FUNCTION public.generate_book_slug(p_title text, p_author text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_slug text;
  v_counter integer := 0;
  v_final_slug text;
BEGIN
  v_slug := LOWER(
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        TRIM(COALESCE(p_title, '')),
        '[^\u0600-\u06FF\u0750-\u077Fa-zA-Z0-9\s]', '', 'g'
      ),
      '\s+', '-', 'g'
    )
  );
  v_slug := REGEXP_REPLACE(v_slug, '^-+|-+$', '', 'g');
  v_slug := REGEXP_REPLACE(v_slug, '-+', '-', 'g');
  IF v_slug IS NULL OR v_slug = '' THEN
    v_slug := 'كتاب';
  END IF;
  v_final_slug := v_slug;
  WHILE EXISTS (
    SELECT 1 FROM public.book_submissions
    WHERE slug = v_final_slug AND status = 'approved'
  ) LOOP
    v_counter := v_counter + 1;
    v_final_slug := v_slug || '-' || v_counter;
  END LOOP;
  RETURN v_final_slug;
END;
$$;