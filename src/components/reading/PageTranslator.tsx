import React, { useState } from 'react';
import { Languages, Loader2, X, Copy, Check, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase, supabaseFunctions } from '@/lib/supabaseClient';
import { toast } from 'sonner';

const LANGS: { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'ar', label: 'العربية' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Español' },
  { code: 'de', label: 'Deutsch' },
  { code: 'tr', label: 'Türkçe' },
  { code: 'it', label: 'Italiano' },
  { code: 'pt', label: 'Português' },
  { code: 'ru', label: 'Русский' },
  { code: 'zh', label: '中文' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'ur', label: 'اردو' },
  { code: 'fa', label: 'فارسی' },
];

const STORAGE_KEY = 'kotobi:translation-target-lang';
const MAX_LEN = 3500;
// أقل من هذا الحد نعتبر النص فقيراً (غالباً كتاب ممسوح ضوئياً) ونستخدم OCR
const MIN_TEXT_CHARS = 40;

interface Props {
  /** يستخرج نص الصفحة الحالية من PDF.js */
  getPageText: () => Promise<string>;
  /** اختياري: يُعيد صورة الصفحة كـ dataURL لاستخدامها في OCR عند فشل استخراج النص */
  getPageImage?: () => Promise<string | null>;
  currentPage?: number;
  /** معرف الكتاب لتخزين/جلب الترجمات من قاعدة البيانات */
  bookId?: string;
}

/**
 * زر ترجمة عائم داخل قارئ PDF.
 * - يجلب الترجمات المخزنة مسبقاً من Supabase ليتجنّب إعادة الترجمة.
 * - يدعم OCR على صورة الصفحة للكتب الممسوحة ضوئياً.
 */
export const PageTranslator: React.FC<Props> = ({ getPageText, getPageImage, currentPage, bookId }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string>('');
  const [sourceText, setSourceText] = useState('');
  const [translation, setTranslation] = useState('');
  const [fromCache, setFromCache] = useState(false);
  const [copied, setCopied] = useState(false);
  const [targetLang, setTargetLang] = useState<string>(() => {
    if (typeof window === 'undefined') return 'en';
    return localStorage.getItem(STORAGE_KEY) || 'en';
  });

  const fetchCached = async (lang: string, page?: number) => {
    if (!bookId || !page) return null;
    const { data } = await supabase
      .from('page_translations')
      .select('translation, source_text')
      .eq('book_id', bookId)
      .eq('page_number', page)
      .eq('target_lang', lang)
      .maybeSingle();
    return data;
  };

  const saveToCache = async (lang: string, page: number | undefined, src: string, tr: string) => {
    if (!bookId || !page || !tr) return;
    try {
      await supabase.from('page_translations').upsert(
        {
          book_id: bookId,
          page_number: page,
          target_lang: lang,
          source_text: src.slice(0, MAX_LEN),
          translation: tr,
        },
        { onConflict: 'book_id,page_number,target_lang', ignoreDuplicates: true },
      );
    } catch (e) {
      console.warn('cache save failed:', e);
    }
  };

  const callTranslate = async (payload: Record<string, unknown>) => {
    const { data, error } = await supabaseFunctions.functions.invoke('translate-text', {
      body: payload,
    });
    if (error) throw error;
    return data as { translation?: string; source?: string; usedOcr?: boolean };
  };

  const runTranslation = async (lang: string, page?: number) => {
    setLoading(true);
    setStatusMsg('جاري استخراج نص الصفحة...');
    setTranslation('');
    setSourceText('');
    setFromCache(false);

    try {
      // 1) جلب من الكاش
      const cached = await fetchCached(lang, page);
      if (cached?.translation) {
        setSourceText(cached.source_text || '');
        setTranslation(cached.translation);
        setFromCache(true);
        setStatusMsg('');
        setLoading(false);
        return;
      }

      // 2) محاولة استخراج النص من PDF
      let text = '';
      try {
        text = await getPageText();
      } catch (_e) {
        text = '';
      }
      const clean = text.replace(/\n---\s*صفحة\s+\d+\s*---\n/g, '').trim();

      // 3) لو النص فقير → OCR على صورة الصفحة
      let result: { translation?: string; source?: string; usedOcr?: boolean } | null = null;

      if (clean.length >= MIN_TEXT_CHARS) {
        setStatusMsg('جاري الترجمة...');
        result = await callTranslate({
          text: clean.slice(0, MAX_LEN),
          targetLang: lang,
        });
      } else if (getPageImage) {
        setStatusMsg('الصفحة بصرية، جاري استخراج النص وترجمته...');
        const img = await getPageImage();
        if (!img) {
          toast.error('تعذر تحضير صورة الصفحة');
          setLoading(false);
          setStatusMsg('');
          return;
        }
        result = await callTranslate({
          imageDataUrl: img,
          targetLang: lang,
        });
      } else {
        toast.error('لا يوجد نص قابل للترجمة في هذه الصفحة');
        setLoading(false);
        setStatusMsg('');
        return;
      }

      const tr = (result?.translation || '').trim();
      const src = (result?.source || clean).trim();
      setSourceText(src);
      setTranslation(tr);
      setStatusMsg('');

      if (tr) {
        // 4) حفظ في الكاش لاستعمال لاحق
        void saveToCache(lang, page, src, tr);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'تعذرت الترجمة';
      console.error('translate error:', err);
      toast.error(message);
    } finally {
      setLoading(false);
      setStatusMsg('');
    }
  };

  const openAndTranslate = async () => {
    setOpen(true);
    await runTranslation(targetLang, currentPage);
  };

  const onLangChange = (lang: string) => {
    setTargetLang(lang);
    localStorage.setItem(STORAGE_KEY, lang);
    void runTranslation(lang, currentPage);
  };

  const copyTranslation = async () => {
    if (!translation) return;
    try {
      await navigator.clipboard.writeText(translation);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('تعذر النسخ');
    }
  };

  return (
    <>
      {/* الزر العائم - الجهة اليمنى */}
      <button
        onClick={openAndTranslate}
        aria-label="ترجمة الصفحة"
        className="fixed bottom-24 right-4 z-40 bg-primary text-primary-foreground rounded-full shadow-xl h-12 w-12 flex items-center justify-center hover:scale-110 active:scale-95 transition-transform"
        title="ترجمة الصفحة الحالية"
      >
        <Languages className="h-5 w-5" />
      </button>

      {open && (
        <div
          dir="rtl"
          className="fixed inset-0 z-[80] flex items-start justify-center p-3 sm:p-6 pointer-events-none"
        >
          <div
            className="absolute inset-0 bg-background/10 backdrop-blur-[1px] pointer-events-auto"
            onClick={() => setOpen(false)}
            aria-hidden
          />

          <div
            onClick={(e) => e.stopPropagation()}
            className="relative pointer-events-auto bg-card/95 backdrop-blur-md border border-primary/30 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col mt-2 sm:mt-8 animate-in fade-in slide-in-from-top-4 duration-200"
          >
            <div className="flex items-center justify-between p-3 sm:p-4 border-b border-border/60">
              <div className="flex items-center gap-2 font-bold text-primary font-cairo text-sm sm:text-base">
                <Languages className="h-4 w-4" />
                ترجمة الصفحة {currentPage ? `(${currentPage})` : ''}
                {fromCache && !loading && (
                  <span className="text-[10px] bg-primary/10 text-primary rounded-full px-2 py-0.5 font-normal">
                    من الذاكرة
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={targetLang}
                  onChange={(e) => onLangChange(e.target.value)}
                  className="text-xs sm:text-sm font-cairo bg-muted/60 rounded-lg px-2 py-1.5 border-0 focus:outline-none focus:ring-1 focus:ring-primary"
                  disabled={loading}
                  aria-label="لغة الترجمة"
                >
                  {LANGS.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setOpen(false)}
                  className="p-1.5 rounded-md hover:bg-muted"
                  aria-label="إغلاق"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="p-4 sm:p-5 overflow-y-auto flex-1">
              <div className="text-base sm:text-lg font-cairo leading-loose text-foreground min-h-[160px]">
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <span className="text-xs">{statusMsg || 'جاري الترجمة...'}</span>
                  </div>
                ) : translation ? (
                  <p className="whitespace-pre-wrap">{translation}</p>
                ) : (
                  <p className="text-muted-foreground text-sm">لا توجد ترجمة بعد.</p>
                )}
              </div>

              {sourceText && !loading && (
                <details className="mt-4 text-xs font-cairo text-muted-foreground">
                  <summary className="cursor-pointer hover:text-foreground flex items-center gap-1">
                    <Eye className="h-3 w-3" /> عرض النص الأصلي
                  </summary>
                  <div className="mt-2 bg-muted/40 rounded-lg p-3 max-h-40 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                    {sourceText.slice(0, MAX_LEN)}
                    {sourceText.length > MAX_LEN && '…'}
                  </div>
                </details>
              )}
            </div>

            {translation && !loading && (
              <div className="p-3 border-t border-border/60">
                <Button
                  onClick={copyTranslation}
                  size="sm"
                  variant="outline"
                  className="w-full font-cairo gap-2"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'تم النسخ' : 'نسخ الترجمة'}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default PageTranslator;
