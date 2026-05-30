CREATE TABLE public.page_translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id TEXT NOT NULL,
  page_number INTEGER NOT NULL,
  target_lang TEXT NOT NULL,
  source_text TEXT,
  translation TEXT NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (book_id, page_number, target_lang)
);

GRANT SELECT ON public.page_translations TO anon;
GRANT SELECT, INSERT ON public.page_translations TO authenticated;
GRANT ALL ON public.page_translations TO service_role;

ALTER TABLE public.page_translations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read page translations"
ON public.page_translations FOR SELECT
USING (true);

CREATE POLICY "Authenticated can insert page translations"
ON public.page_translations FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE INDEX idx_page_translations_lookup
ON public.page_translations (book_id, page_number, target_lang);