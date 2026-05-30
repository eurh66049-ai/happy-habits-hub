
-- ============= STORY HIGHLIGHTS (Feature 14 enhancement) =============
CREATE TABLE public.story_highlights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  cover_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.story_highlights TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.story_highlights TO authenticated;
GRANT ALL ON public.story_highlights TO service_role;

ALTER TABLE public.story_highlights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Highlights are viewable by everyone"
  ON public.story_highlights FOR SELECT
  USING (true);

CREATE POLICY "Users create own highlights"
  ON public.story_highlights FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own highlights"
  ON public.story_highlights FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own highlights"
  ON public.story_highlights FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_story_highlights_user ON public.story_highlights(user_id, created_at DESC);

-- Snapshot of story content (so it survives 24h expiry of original story)
CREATE TABLE public.story_highlight_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  highlight_id UUID NOT NULL REFERENCES public.story_highlights(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  story_id UUID,
  media_url TEXT NOT NULL,
  media_type TEXT NOT NULL,
  caption TEXT,
  duration INTEGER DEFAULT 5,
  book_id TEXT,
  book_slug TEXT,
  source_created_at TIMESTAMPTZ,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.story_highlight_items TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.story_highlight_items TO authenticated;
GRANT ALL ON public.story_highlight_items TO service_role;

ALTER TABLE public.story_highlight_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Highlight items viewable by everyone"
  ON public.story_highlight_items FOR SELECT
  USING (true);

CREATE POLICY "Users add own highlight items"
  ON public.story_highlight_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own highlight items"
  ON public.story_highlight_items FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_highlight_items_highlight ON public.story_highlight_items(highlight_id, sort_order);

-- ============= BOOK QUIZZES (Feature 6) =============
CREATE TABLE public.book_quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID NOT NULL,
  difficulty TEXT NOT NULL DEFAULT 'medium',
  question_count INTEGER NOT NULL DEFAULT 10,
  questions JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.book_quizzes TO anon;
GRANT SELECT ON public.book_quizzes TO authenticated;
GRANT ALL ON public.book_quizzes TO service_role;

ALTER TABLE public.book_quizzes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Quizzes viewable by everyone"
  ON public.book_quizzes FOR SELECT
  USING (true);

CREATE INDEX idx_book_quizzes_lookup ON public.book_quizzes(book_id, difficulty, question_count, created_at DESC);

CREATE TABLE public.book_quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  book_id UUID NOT NULL,
  quiz_id UUID REFERENCES public.book_quizzes(id) ON DELETE SET NULL,
  difficulty TEXT NOT NULL,
  question_count INTEGER NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  answers JSONB NOT NULL DEFAULT '[]'::jsonb,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.book_quiz_attempts TO authenticated;
GRANT ALL ON public.book_quiz_attempts TO service_role;

ALTER TABLE public.book_quiz_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own quiz attempts"
  ON public.book_quiz_attempts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users create own quiz attempts"
  ON public.book_quiz_attempts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_quiz_attempts_user ON public.book_quiz_attempts(user_id, completed_at DESC);
CREATE INDEX idx_quiz_attempts_book ON public.book_quiz_attempts(book_id);

CREATE TRIGGER update_story_highlights_updated_at
  BEFORE UPDATE ON public.story_highlights
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
