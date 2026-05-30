
UPDATE public.book_submissions
SET slug = public.generate_book_slug(title, author)
WHERE id IN (
  SELECT id FROM public.book_submissions
  WHERE status='approved' AND slug ~ '-[a-z0-9]+-[a-z0-9]{5,8}$'
  LIMIT 2000
);
