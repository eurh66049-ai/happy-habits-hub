import React, { useState } from 'react';
import { Sparkles, Loader2, Search, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabaseFunctions } from '@/lib/supabaseClient';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { optimizeImageUrl } from '@/utils/imageProxy';

interface SemanticResult {
  book_id: string;
  title: string;
  author: string;
  category: string | null;
  description: string | null;
  cover_image_url: string | null;
  slug: string | null;
  similarity: number;
}

interface Props {
  onNavigate?: () => void;
}

/**
 * بحث دلالي بالمعنى: "كتاب يتحدث عن مواجهة الخوف والنمو الشخصي"
 * يستخدم AI embeddings لإيجاد كتب قريبة المعنى وليس فقط مطابقة الكلمات.
 */
export const SemanticSearchPanel: React.FC<Props> = ({ onNavigate }) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SemanticResult[] | null>(null);
  const [touched, setTouched] = useState(false);

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = query.trim();
    if (q.length < 3) {
      toast.error('اكتب وصفاً للكتاب الذي تبحث عنه (3 أحرف على الأقل)');
      return;
    }
    setLoading(true);
    setTouched(true);
    try {
      const { data, error } = await supabaseFunctions.functions.invoke('semantic-book-search', {
        body: { query: q, limit: 18 },
      });
      if (error) throw error;
      setResults(data?.results || []);
    } catch (err: any) {
      console.error('semantic search error:', err);
      toast.error(err?.message || 'تعذر إجراء البحث الدلالي');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const openBook = (b: SemanticResult) => {
    const slug = b.slug || b.book_id;
    navigate(`/book/${slug}`);
    onNavigate?.();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground font-cairo">
        <Sparkles className="h-4 w-4 text-primary" />
        <span>بحث ذكي بالمعنى — اكتب وصفاً، ليس فقط كلمات.</span>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='مثال: "كتاب عن مواجهة الخوف والنمو الشخصي"'
          className="font-cairo rounded-xl"
          disabled={loading}
          autoFocus
        />
        <Button type="submit" disabled={loading || !query.trim()} className="rounded-xl">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </Button>
      </form>

      {loading && (
        <div className="text-center py-8 text-sm text-muted-foreground font-cairo">
          <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-primary" />
          نحلل المعنى ونبحث في المكتبة...
        </div>
      )}

      {!loading && touched && results && results.length === 0 && (
        <div className="text-center py-8 text-sm text-muted-foreground font-cairo">
          <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-40" />
          لم نجد كتباً مطابقة. جرّب وصفاً مختلفاً.
          <p className="text-xs mt-2 opacity-70">
            ملاحظة: الفهرسة الدلالية جارية لبعض الكتب.
          </p>
        </div>
      )}

      {!loading && results && results.length > 0 && (
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {results.map((b) => (
            <button
              key={b.book_id}
              onClick={() => openBook(b)}
              className="w-full text-right flex gap-3 p-2 rounded-xl hover:bg-muted/60 transition-colors border border-border/50"
            >
              {b.cover_image_url ? (
                <img
                  src={optimizeImageUrl(b.cover_image_url, 'thumbnail')}
                  alt={b.title}
                  className="w-12 h-16 object-cover rounded-md flex-shrink-0"
                  loading="lazy"
                />
              ) : (
                <div className="w-12 h-16 bg-muted rounded-md flex items-center justify-center flex-shrink-0">
                  <BookOpen className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm text-foreground font-cairo line-clamp-1">{b.title}</div>
                <div className="text-xs text-muted-foreground font-cairo line-clamp-1">{b.author}</div>
                {b.description && (
                  <div className="text-xs text-muted-foreground/80 font-cairo line-clamp-2 mt-1">
                    {b.description}
                  </div>
                )}
                <div className="text-[10px] text-primary mt-1 font-cairo">
                  تطابق {Math.round(b.similarity * 100)}%
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default SemanticSearchPanel;
