import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { createBookSlug } from '@/utils/bookSlug';
import { markDailyTask } from '@/utils/dailyTasks';

export interface ReadingHistoryItem {
  id: string;
  book_id: string;
  book_title: string;
  book_author: string | null;
  book_cover_url: string | null;
  book_slug: string | null;
  current_page: number;
  total_pages: number;
  progress_percentage: number;
  last_read_at: string;
  started_at: string;
  completed_at: string | null;
  is_completed: boolean;
}

const PAGE_SIZE = 24;

// كاش على مستوى الموديول للحفاظ على البيانات بين التنقلات (يبقى حتى إغلاق المتصفح)
const historyCache: {
  userId: string | null;
  data: ReadingHistoryItem[] | null;
  page: number;
  hasMore: boolean;
} = { userId: null, data: null, page: 0, hasMore: true };

export const useReadingHistory = () => {
  const { user } = useAuth();
  const cached = user && historyCache.userId === user.id ? historyCache.data : null;
  const [history, setHistory] = useState<ReadingHistoryItem[]>(cached || []);
  const [loading, setLoading] = useState(!cached);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(cached ? historyCache.hasMore : true);
  const [page, setPage] = useState(cached ? historyCache.page : 0);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(async (pageNum: number, append: boolean) => {
    if (!user) {
      setHistory([]);
      setLoading(false);
      return;
    }

    try {
      if (append) setLoadingMore(true); else setLoading(true);
      const from = pageNum * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error: fetchError } = await supabase
        .from('reading_history')
        .select('*')
        .eq('user_id', user.id)
        .order('last_read_at', { ascending: false })
        .range(from, to);

      if (fetchError) throw fetchError;

      const rows = data || [];
      const bookIds = rows.map((item) => item.book_id);
      let slugMap = new Map<string, string>();
      if (bookIds.length > 0) {
        const { data: booksData } = await supabase
          .from('book_submissions')
          .select('id, slug, title, author')
          .in('id', bookIds);
        booksData?.forEach((book) => {
          if (book.slug) slugMap.set(book.id, book.slug);
          else if (book.title && book.author) slugMap.set(book.id, createBookSlug(book.title, book.author));
        });
      }

      const withSlugs = rows.map((item) => ({
        ...item,
        book_slug: slugMap.get(item.book_id) || null,
      })) as ReadingHistoryItem[];

      setHistory((prev) => {
        const next = append ? [...prev, ...withSlugs] : withSlugs;
        historyCache.userId = user!.id;
        historyCache.data = next;
        historyCache.page = pageNum;
        historyCache.hasMore = rows.length === PAGE_SIZE;
        return next;
      });
      setHasMore(rows.length === PAGE_SIZE);
      setPage(pageNum);
      setError(null);
    } catch (err) {
      console.error('Error fetching reading history:', err);
      setError('فشل تحميل سجل القراءة');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [user]);

  const refreshHistory = useCallback(async () => {
    setPage(0);
    setHasMore(true);
    await fetchPage(0, false);
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (!hasMore || loadingMore || loading) return;
    fetchPage(page + 1, true);
  }, [fetchPage, hasMore, loadingMore, loading, page]);

  const saveReadingProgress = async (
    bookId: string,
    bookTitle: string,
    currentPage: number,
    totalPages: number,
    bookAuthor?: string,
    bookCoverUrl?: string
  ) => {
    if (!user) return;
    try {
      const { error: upsertError } = await supabase
        .from('reading_history')
        .upsert({
          user_id: user.id,
          book_id: bookId,
          book_title: bookTitle,
          book_author: bookAuthor,
          book_cover_url: bookCoverUrl,
          current_page: currentPage,
          total_pages: totalPages,
          last_read_at: new Date().toISOString(),
        }, { onConflict: 'user_id,book_id' });
      if (upsertError) throw upsertError;
      await refreshHistory();
      // إكمال المهمة اليومية: فتح كتاب لم تقرأه اليوم
      void markDailyTask('read_new_book');
    } catch (err) {
      console.error('Error saving reading progress:', err);
    }
  };

  const deleteHistoryItem = async (id: string) => {
    if (!user) return;
    try {
      const { error: deleteError } = await supabase
        .from('reading_history')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);
      if (deleteError) throw deleteError;
      setHistory((prev) => {
        const next = prev.filter((h) => h.id !== id);
        if (historyCache.userId === user.id) historyCache.data = next;
        return next;
      });
    } catch (err) {
      console.error('Error deleting history item:', err);
    }
  };

  useEffect(() => {
    if (!user) {
      setHistory([]);
      setLoading(false);
      return;
    }
    // إذا كانت البيانات مخزنة لنفس المستخدم، لا تعد الجلب
    if (historyCache.userId === user.id && historyCache.data) {
      setHistory(historyCache.data);
      setPage(historyCache.page);
      setHasMore(historyCache.hasMore);
      setLoading(false);
      return;
    }
    refreshHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return {
    history,
    loading,
    loadingMore,
    hasMore,
    error,
    saveReadingProgress,
    deleteHistoryItem,
    refreshHistory,
    loadMore,
  };
};
