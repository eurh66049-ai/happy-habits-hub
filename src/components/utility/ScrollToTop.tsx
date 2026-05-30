import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * يعيد التمرير لأعلى الصفحة عند تغيير المسار،
 * ويستخدم scroll instant لتفادي أي تأخير بصري.
 */
const ScrollToTop = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    // استخدام instant ليكون التنقل بين الصفحات فوريًا بدون لاغ
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);

  return null;
};

export default ScrollToTop;
