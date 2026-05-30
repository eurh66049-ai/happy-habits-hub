
ALTER TABLE public.auto_discover_config
  ADD COLUMN IF NOT EXISTS search_queries jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS current_query_index integer NOT NULL DEFAULT 0;

UPDATE public.auto_discover_config
SET search_queries = '[
  "collection:booksbylanguage_arabic AND mediatype:texts AND format:PDF",
  "روايات",
  "تاريخ",
  "فقه",
  "شعر",
  "فلسفة",
  "أدب عربي",
  "علوم",
  "تفسير",
  "حديث",
  "سيرة",
  "تراجم",
  "اقتصاد",
  "علم نفس",
  "تربية",
  "طب",
  "رياضيات",
  "فيزياء",
  "كيمياء",
  "لغة عربية",
  "نحو",
  "بلاغة",
  "قصص أطفال",
  "مغامرات",
  "خيال علمي",
  "تنمية بشرية",
  "إدارة",
  "قانون",
  "سياسة",
  "اجتماع",
  "جغرافيا",
  "آثار",
  "فنون",
  "موسيقى",
  "عمارة",
  "حاسوب",
  "برمجة"
]'::jsonb,
    min_pending_threshold = 0
WHERE id = 1 AND (search_queries IS NULL OR jsonb_array_length(search_queries) = 0);
