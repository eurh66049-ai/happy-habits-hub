/**
 * نظام تحميل مسبق ذكي لصفحات الموقع لجعل التنقل سلسًا جدًا.
 * عند مرور المؤشر فوق أي رابط، أو لمسه، أو تمريره داخل الشاشة،
 * يتم تحميل الـ chunk الخاص بتلك الصفحة مسبقًا فيُفتح فورًا عند الضغط.
 */

type Loader = () => Promise<unknown>;

// خرائط المسارات → دوال التحميل (تتطابق مع lazy imports في App.tsx)
const exactRoutes: Record<string, Loader> = {
  '/': () => import('@/pages/Index'),
  '/search': () => import('@/pages/SearchResults'),
  '/auth': () => import('@/pages/Auth'),
  '/reset-password': () => import('@/pages/ResetPassword'),
  '/upload-book': () => import('@/pages/UploadBook'),
  '/profile': () => import('@/pages/UserProfile'),
  '/my-books': () => import('@/pages/MyBooks'),
  '/favorites': () => import('@/pages/Favorites'),
  '/quotes': () => import('@/pages/Quotes'),
  '/site-updates': () => import('@/pages/SiteUpdates'),
  '/daily-messages': () => import('@/pages/SiteUpdates'),
  '/donation': () => import('@/pages/Donation'),
  '/donation-success': () => import('@/pages/DonationSuccess'),
  '/profile-customization': () => import('@/pages/ProfileCustomization'),
  '/categories': () => import('@/pages/BookCategories'),
  '/authors': () => import('@/pages/Authors'),
  '/suggestions': () => import('@/pages/Suggestions'),
  '/messages': () => import('@/pages/Messages'),
  '/reading-clubs': () => import('@/pages/ReadingClubs'),
  '/cover-designer': () => import('@/pages/CoverDesigner'),
  '/about': () => import('@/pages/AboutUs'),
  '/about-us': () => import('@/pages/AboutUs'),
  '/contact': () => import('@/pages/ContactUs'),
  '/contact-us': () => import('@/pages/ContactUs'),
  '/privacy': () => import('@/pages/PrivacyPolicy'),
  '/privacy-policy': () => import('@/pages/PrivacyPolicy'),
  '/terms': () => import('@/pages/TermsOfService'),
  '/terms-of-service': () => import('@/pages/TermsOfService'),
  '/admin/books': () => import('@/pages/AdminBooks'),
  '/admin/analytics': () => import('@/pages/AdminAnalytics'),
  '/admin/seo': () => import('@/pages/AdminSEO'),
};

const prefixRoutes: Array<{ prefix: string; load: Loader }> = [
  { prefix: '/book/reading/', load: () => import('@/pages/PDFReaderPage') },
  { prefix: '/book/', load: () => import('@/pages/BookDetails') },
  { prefix: '/category/', load: () => import('@/pages/CategoryBooks') },
  { prefix: '/author/', load: () => import('@/pages/AuthorPage') },
  { prefix: '/user/', load: () => import('@/pages/PublicUserProfile') },
  { prefix: '/reading-clubs/', load: () => import('@/pages/ReadingClubRoom') },
];

const prefetched = new Set<string>();

const loaderForPath = (path: string): Loader | null => {
  if (exactRoutes[path]) return exactRoutes[path];
  for (const { prefix, load } of prefixRoutes) {
    if (path.startsWith(prefix) && path.length > prefix.length) return load;
  }
  return null;
};

export const prefetchPath = (path: string) => {
  if (!path || prefetched.has(path)) return;
  const loader = loaderForPath(path);
  if (!loader) return;
  prefetched.add(path);
  // لا تكسر التطبيق إذا فشل التحميل المسبق
  loader().catch(() => prefetched.delete(path));
};

const normalize = (href: string): string | null => {
  try {
    const url = new URL(href, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    return url.pathname;
  } catch {
    return null;
  }
};

const handleEvent = (e: Event) => {
  const target = e.target as HTMLElement | null;
  if (!target) return;
  const anchor = target.closest('a[href]') as HTMLAnchorElement | null;
  if (!anchor) return;
  const href = anchor.getAttribute('href');
  if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
  const path = normalize(anchor.href);
  if (path) prefetchPath(path);
};

let installed = false;

export const installRoutePrefetcher = () => {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  // التحميل المسبق عند التحويم/اللمس
  document.addEventListener('mouseover', handleEvent, { passive: true, capture: true });
  document.addEventListener('touchstart', handleEvent, { passive: true, capture: true });
  document.addEventListener('focusin', handleEvent, { passive: true, capture: true });

  // تحميل الصفحات الرئيسية بهدوء في وقت الخمول
  const idlePrefetch = () => {
    [
      '/quotes', '/favorites', '/my-books', '/profile',
      '/categories', '/authors', '/site-updates',
    ].forEach(prefetchPath);
  };
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
  if (typeof ric === 'function') ric(idlePrefetch);
  else setTimeout(idlePrefetch, 2500);
};
