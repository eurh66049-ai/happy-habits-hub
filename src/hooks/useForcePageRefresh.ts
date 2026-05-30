// تم تعطيل إجبار إعادة التحميل لأنه كان يسبب تحديث الصفحة عدة مرات أثناء التصفح.
import { useLocation, useNavigate } from 'react-router-dom';
import { NavigationHistoryManager } from '@/utils/navigationHistory';

interface UseForcePageRefreshOptions {
  enabled?: boolean;
  excludePaths?: string[];
  forceRefreshOnBookChange?: boolean;
  forceRefreshOnCategoryChange?: boolean;
}

export const useForcePageRefresh = (_options: UseForcePageRefreshOptions = {}) => {
  const location = useLocation();
  const navigate = useNavigate();

  // تنقل عادي عبر React Router بدون إعادة تحميل كاملة للصفحة
  const navigateWithRefresh = (path: string, saveCurrentState = true) => {
    if (saveCurrentState) {
      NavigationHistoryManager.saveCurrentState(location.pathname + location.search);
    }
    navigate(path);
  };

  return {
    navigateWithRefresh,
    currentPath: location.pathname,
  };
};
