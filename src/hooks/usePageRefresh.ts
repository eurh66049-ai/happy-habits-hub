import { useLocation } from 'react-router-dom';

interface UsePageRefreshOptions {
  refreshOnBookChange?: boolean;
  refreshOnCategoryChange?: boolean;
  refreshOnAuthorChange?: boolean;
  excludePaths?: string[];
  delay?: number;
}

// ✅ تم تعطيل إعادة التحميل الإجباري (window.location.reload) لأنها كانت تسبب
// تحديث الصفحة عدة مرات أثناء التصفح بين الكتب/الأقسام/المؤلفين.
// التنقل بين هذه الصفحات يعتمد الآن على React Router فقط (SPA navigation).
export const usePageRefresh = (_options: UsePageRefreshOptions = {}) => {
  const location = useLocation();
  return {
    currentPath: location.pathname,
    shouldRefresh: false,
  };
};
