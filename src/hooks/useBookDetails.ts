
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { validatePDFUrl, enhancePDFUrl } from '@/utils/pdfValidator';
import { convertPdfToProxyUrl } from '@/utils/imageProxy';

const isSupabasePublicFileUrl = (url: string) => url.includes('/storage/v1/object/public/');

interface BookDetails {
  id: string;
  title: string;
  subtitle?: string;
  author: string;
  author_image_url?: string;
  category: string;
  description: string;
  language: string;
  publication_year?: number;
  page_count?: number;
  publisher?: string;
  cover_image_url?: string;
  book_file_url?: string;
  file_type?: string;
  display_type?: string;
  views: number;
  rating?: number;
  created_at: string;
  user_email?: string;
  file_size?: number;
  slug?: string;
}

// Helper: fetch with retry on transient errors
const fetchBookWithRetry = async (bookId: string, retries = 2): Promise<{ data: any; error: any }> => {
  let lastError: any = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const { data, error } = await supabase.rpc('get_book_details', { p_book_id: bookId });
    if (!error) return { data, error: null };
    lastError = error;
    // Don't retry on permission errors
    if (error.code === '42501') return { data: null, error };
    // Brief backoff before retry
    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
    }
  }
  return { data: null, error: lastError };
};

export const useBookDetails = (bookId: string) => {
  const [book, setBook] = useState<BookDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!bookId) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchBookDetails = async () => {
      try {
        setLoading(true);
        setError(null);
        setBook(null);

        // البحث أولاً بـ slug، إذا لم ينجح نبحث بـ UUID — مع إعادة المحاولة عند فشل الشبكة
        const { data, error: supabaseError } = await fetchBookWithRetry(bookId, 2);

        if (cancelled) return;

        if (supabaseError && supabaseError.code === '42501') {
          setError('ليس لديك تصريح لرؤية هذا الكتاب');
          setBook(null);
          return;
        }
        if (supabaseError) {
          setError('فشل في تحميل تفاصيل الكتاب');
          return;
        }

        if (data && data.length > 0) {
          const bookData = data[0];

          let pdfUrl = bookData.book_file_url;
          if (pdfUrl) {
            if (!validatePDFUrl(pdfUrl)) {
              if (!pdfUrl.startsWith('http')) {
                pdfUrl = 'https://' + pdfUrl;
              }
            }
            if (isSupabasePublicFileUrl(pdfUrl)) {
              // تحويل فوري بدون أي استعلام شبكي — لا حاجة للتحقق من وجود الملف هنا
              pdfUrl = convertPdfToProxyUrl(pdfUrl);
            }
          }

          if (cancelled) return;

          const formattedBookData: BookDetails = {
            id: bookData.id,
            title: bookData.title,
            subtitle: bookData.subtitle,
            author: bookData.author,
            author_image_url: bookData.author_image_url,
            category: bookData.category,
            description: bookData.description,
            language: bookData.language,
            publication_year: bookData.publication_year,
            page_count: bookData.page_count,
            cover_image_url: bookData.cover_image_url,
            book_file_url: pdfUrl,
            file_type: bookData.file_type,
            display_type: bookData.display_type,
            views: bookData.views || 0,
            rating: bookData.rating,
            created_at: bookData.created_at,
            user_email: bookData.user_email,
            file_size: bookData.file_size,
            slug: bookData.slug,
            publisher: bookData.publisher
          };
          if (!cancelled) setBook(formattedBookData);
        } else {
          if (!cancelled) setError('الكتاب غير موجود أو ليس لديك إذن عرض');
        }
      } catch (err: any) {
        if (cancelled) return;
        if (err?.code === '42501' || err?.message?.includes('permission')) {
          setError('ليس لديك تصريح لرؤية هذا المحتوى');
        } else {
          setError('فشل في تحميل تفاصيل الكتاب');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchBookDetails();
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  return { book, loading, error };
};
