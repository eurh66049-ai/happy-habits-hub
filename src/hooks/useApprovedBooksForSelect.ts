import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface SelectBook {
  id: string;
  title: string;
  author: string;
  category: string;
  cover_image_url?: string;
}

/**
 * يبحث في الكتب المعتمدة عبر السيرفر (Postgres ilike) بدل تحميل الكل في المتصفح.
 * عدد الكتب في الموقع تجاوز ال 26 ألف، لذا فلترة العميل لا تكفي.
 *
 * - بدون استعلام: يُعيد آخر N كتاب معتمد.
 * - مع استعلام: يبحث في العنوان والمؤلف على السيرفر مع debounce.
 */
export const useApprovedBooksForSelect = (search: string = '', limit: number = 50) => {
  const [books, setBooks] = useState<SelectBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  useEffect(() => {
    const currentId = ++reqId.current;
    const term = search.trim();

    const run = async () => {
      try {
        setLoading(true);
        setError(null);

        let query = supabase
          .from('book_submissions')
          .select('id, title, author, category, cover_image_url')
          .eq('status', 'approved')
          .limit(limit);

        if (term.length > 0) {
          // هروب فواصل PostgREST .or()
          const safe = term.replace(/[,()]/g, ' ').trim();
          query = query.or(`title.ilike.%${safe}%,author.ilike.%${safe}%`).order('title');
        } else {
          query = query.order('created_at', { ascending: false });
        }

        const { data, error } = await query;
        if (error) throw error;
        if (currentId === reqId.current) {
          setBooks(data || []);
        }
      } catch (err) {
        if (currentId === reqId.current) {
          console.error('خطأ في جلب الكتب:', err);
          setError('فشل في تحميل الكتب');
          setBooks([]);
        }
      } finally {
        if (currentId === reqId.current) setLoading(false);
      }
    };

    const handle = setTimeout(run, term.length > 0 ? 250 : 0);
    return () => clearTimeout(handle);
  }, [search, limit]);

  return { books, loading, error };
};
