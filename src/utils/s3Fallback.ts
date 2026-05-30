/**
 * آلية fallback تلقائية: لو فشل تحميل ملف من S3،
 * نرجع تلقائياً إلى الرابط الأصلي على Supabase.
 * أسماء الملفات متطابقة بين S3 و Supabase، لذا نحوّل الرابط تلقائياً.
 */

const SUPABASE_PUBLIC = "https://kydmyxsgyxeubhmqzrgo.supabase.co/storage/v1/object/public";
const S3_HOST_RE = /https?:\/\/kotobi\.s3\.[^/]+\.amazonaws\.com\//i;

const failedUrls = new Set<string>();

/**
 * يحوّل رابط S3 إلى رابط Supabase الأصلي المقابل (نفس اسم الملف).
 * مثال:
 *   https://kotobi.s3.eu-north-1.amazonaws.com/covers/abc.jpg
 *   → https://...supabase.co/storage/v1/object/public/book-covers/covers/abc.jpg
 */
export function s3ToSupabaseUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  let target = url;

  // فك تغليف wsrv.nl لو الصورة كانت ممرّرة عبر بروكسي
  // مثال: https://wsrv.nl/?url=<encoded>&w=...
  if (target.includes("wsrv.nl/?")) {
    try {
      const u = new URL(target);
      const inner = u.searchParams.get("url");
      if (inner) {
        const decoded = decodeURIComponent(inner);
        target = decoded.startsWith("http") ? decoded : `https://${decoded}`;
      }
    } catch {
      /* ignore */
    }
  }

  if (!S3_HOST_RE.test(target)) return url;
  const path = target.replace(S3_HOST_RE, "");
  if (path.startsWith("covers/")) return `${SUPABASE_PUBLIC}/book-covers/${path}`;
  if (path.startsWith("books/")) return `${SUPABASE_PUBLIC}/book-files/${path}`;
  return url;
}

export function isS3Url(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.includes("kotobi.s3.") || url.startsWith("s3://");
}

/**
 * يُستخدم كـ onError handler لعنصر <img>.
 * مثال:
 *   <img src={book.cover_image_url}
 *        onError={(e) => handleImageS3Fallback(e, book.original_cover_image_url)} />
 */
export function handleImageS3Fallback(
  event: React.SyntheticEvent<HTMLImageElement>,
  fallbackUrl: string | null | undefined,
) {
  const img = event.currentTarget;
  if (!fallbackUrl) return;
  if (failedUrls.has(img.src)) return;
  failedUrls.add(img.src);
  if (img.src !== fallbackUrl) {
    console.warn("[S3 fallback] cover failed, using Supabase original:", img.src);
    img.src = fallbackUrl;
  }
}

/**
 * يختار أفضل رابط متاح للملف:
 * - يجرب S3 أولاً
 * - يرجع للرابط الأصلي تلقائياً إذا فشل سابقاً
 */
export function pickBookFileUrl(
  s3Url: string | null | undefined,
  originalUrl: string | null | undefined,
): string | null {
  if (s3Url && !failedUrls.has(s3Url)) return s3Url;
  return originalUrl || s3Url || null;
}

/**
 * يتحقق فعلياً من إمكانية الوصول لرابط S3 ويرجع للأصلي إذا فشل.
 * تُستخدم قبل فتح ملف PDF/كتاب.
 */
export async function resolveWithFallback(
  primaryUrl: string | null | undefined,
  fallbackUrl: string | null | undefined,
): Promise<string | null> {
  if (!primaryUrl) return fallbackUrl || null;
  if (!fallbackUrl || !isS3Url(primaryUrl)) return primaryUrl;
  if (failedUrls.has(primaryUrl)) return fallbackUrl;

  try {
    const res = await fetch(primaryUrl, { method: "HEAD" });
    if (res.ok) return primaryUrl;
    failedUrls.add(primaryUrl);
    console.warn("[S3 fallback] file unreachable, using Supabase original");
    return fallbackUrl;
  } catch {
    failedUrls.add(primaryUrl);
    return fallbackUrl;
  }
}
