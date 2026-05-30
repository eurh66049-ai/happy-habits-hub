import React, { useEffect, useState } from 'react';
import BookQuizDialog from './BookQuizDialog';

export interface BookCompletedDetail {
  bookId: string;
  bookTitle: string;
}

const SEEN_KEY = 'kutubi_quiz_offered';

const getSeen = (): Record<string, number> => {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}'); } catch { return {}; }
};

const BookQuizLauncher: React.FC = () => {
  const [target, setTarget] = useState<BookCompletedDetail | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<BookCompletedDetail>).detail;
      if (!detail?.bookId) return;
      // Offer the quiz at most once per day per book
      const seen = getSeen();
      const last = seen[detail.bookId] || 0;
      if (Date.now() - last < 24 * 60 * 60 * 1000) return;
      seen[detail.bookId] = Date.now();
      try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen)); } catch {}
      setTarget(detail);
    };
    window.addEventListener('book:completed', handler as EventListener);
    return () => window.removeEventListener('book:completed', handler as EventListener);
  }, []);

  if (!target) return null;

  return (
    <BookQuizDialog
      open={!!target}
      onOpenChange={(v) => { if (!v) setTarget(null); }}
      bookId={target.bookId}
      bookTitle={target.bookTitle}
    />
  );
};

export default BookQuizLauncher;
