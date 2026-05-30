
-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- Embeddings table
CREATE TABLE IF NOT EXISTS public.book_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES public.book_submissions(id) ON DELETE CASCADE,
  embedding vector(1024) NOT NULL,
  content_hash text,
  model text NOT NULL DEFAULT 'mistral-embed',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(book_id, model)
);

GRANT SELECT ON public.book_embeddings TO anon;
GRANT SELECT ON public.book_embeddings TO authenticated;
GRANT ALL ON public.book_embeddings TO service_role;

ALTER TABLE public.book_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "embeddings readable by all"
  ON public.book_embeddings FOR SELECT
  USING (true);

CREATE POLICY "embeddings managed by service role"
  ON public.book_embeddings FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS book_embeddings_book_id_idx
  ON public.book_embeddings(book_id);

CREATE INDEX IF NOT EXISTS book_embeddings_hnsw_idx
  ON public.book_embeddings
  USING hnsw (embedding vector_cosine_ops);

-- Semantic match function
CREATE OR REPLACE FUNCTION public.match_books_semantic(
  query_embedding vector(1024),
  match_count int DEFAULT 12,
  min_similarity float DEFAULT 0.3
)
RETURNS TABLE (
  book_id uuid,
  title text,
  author text,
  category text,
  description text,
  cover_image_url text,
  slug text,
  similarity float
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT
    bs.id AS book_id,
    bs.title,
    bs.author,
    bs.category,
    bs.description,
    bs.cover_image_url,
    bs.slug,
    1 - (be.embedding <=> query_embedding) AS similarity
  FROM public.book_embeddings be
  JOIN public.book_submissions bs ON bs.id = be.book_id
  WHERE bs.status = 'approved'
    AND 1 - (be.embedding <=> query_embedding) > min_similarity
  ORDER BY be.embedding <=> query_embedding
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION public.match_books_semantic(vector, int, float) TO anon, authenticated, service_role;
