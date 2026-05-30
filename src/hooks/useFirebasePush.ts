import { useState, useEffect, useCallback } from 'react';
import { getToken, deleteToken, onMessage } from 'firebase/messaging';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { getMessagingIfSupported, VAPID_KEY } from '@/integrations/firebase/client';
import { toast } from 'sonner';

const SW_PATH = '/firebase-messaging-sw.js';
const STORED_TOKEN_KEY = 'fcm_token_v1';
const PUSH_DISABLED_KEY = 'fcm_push_disabled_v1';

export const useFirebasePush = () => {
  const { user } = useAuth();
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  );
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Detect support + initial state
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const supported =
      'Notification' in window &&
      'serviceWorker' in navigator &&
      'PushManager' in window;
    setIsSupported(supported);

    if (!supported) {
      setInitialized(true);
      return;
    }

    setPermission(Notification.permission);

    (async () => {
      try {
        // Register the FCM service worker
        await navigator.serviceWorker.register(SW_PATH, { scope: '/' });

        const messaging = await getMessagingIfSupported();
        if (!messaging) {
          setInitialized(true);
          return;
        }

        // Foreground messages → show as toast + browser notification
        onMessage(messaging, (payload) => {
          const title = payload.notification?.title || payload.data?.title || 'إشعار جديد';
          const body = payload.notification?.body || payload.data?.body || '';
          toast(title, { description: body });
        });

        const pushDisabled = localStorage.getItem(PUSH_DISABLED_KEY) === 'true';

        // أعد تفعيل الاشتراك تلقائياً فقط إذا لم يكن المستخدم قد ألغاه بنفسه.
        if (Notification.permission === 'granted' && user && !pushDisabled) {
          try {
            const registration = await navigator.serviceWorker.ready;
            const token = await getToken(messaging, {
              vapidKey: VAPID_KEY,
              serviceWorkerRegistration: registration,
            });
            if (token) {
              await supabase.from('fcm_tokens').upsert(
                {
                  user_id: user.id,
                  token,
                  user_agent: navigator.userAgent,
                  is_active: true,
                  updated_at: new Date().toISOString(),
                },
                { onConflict: 'token' }
              );
              localStorage.setItem(STORED_TOKEN_KEY, token);
              setIsSubscribed(true);
            }
          } catch (e) {
            console.warn('[Firebase] Silent re-subscribe failed:', e);
          }
        }
      } catch (e) {
        console.error('[Firebase] Init error:', e);
      } finally {
        setInitialized(true);
      }
    })();
  }, [user]);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!user) {
      toast.error('يجب تسجيل الدخول أولاً');
      return false;
    }
    if (!isSupported) {
      toast.error('متصفحك لا يدعم الإشعارات');
      return false;
    }

    setLoading(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        toast.error('لم يتم منح إذن الإشعارات');
        return false;
      }

      const messaging = await getMessagingIfSupported();
      if (!messaging) {
        toast.error('Firebase Messaging غير مدعوم');
        return false;
      }

      const registration = await navigator.serviceWorker.ready;
      const token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: registration,
      });

      if (!token) {
        toast.error('فشل الحصول على رمز الإشعارات');
        return false;
      }

      const { error } = await supabase
        .from('fcm_tokens')
        .upsert(
          {
            user_id: user.id,
            token,
            user_agent: navigator.userAgent,
            is_active: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'token' }
        );

      if (error) {
        console.error('[Firebase] DB save error:', error);
        toast.error('حدث خطأ أثناء حفظ الاشتراك');
        return false;
      }

      localStorage.removeItem(PUSH_DISABLED_KEY);
      localStorage.setItem(STORED_TOKEN_KEY, token);
      setIsSubscribed(true);
      toast.success('تم تفعيل الإشعارات بنجاح! 🔔');
      return true;
    } catch (e) {
      console.error('[Firebase] Subscribe error:', e);
      toast.error('حدث خطأ أثناء تفعيل الإشعارات');
      return false;
    } finally {
      setLoading(false);
    }
  }, [user, isSupported]);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    try {
      const messaging = await getMessagingIfSupported();
      if (messaging) {
        try {
          await deleteToken(messaging);
        } catch (e) {
          console.warn('[Firebase] deleteToken warning:', e);
        }
      }

      const storedToken = localStorage.getItem(STORED_TOKEN_KEY);
      if (storedToken) {
        await supabase
          .from('fcm_tokens')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('token', storedToken);
        localStorage.removeItem(STORED_TOKEN_KEY);
      }

      localStorage.setItem(PUSH_DISABLED_KEY, 'true');
      setIsSubscribed(false);
      toast.success('تم إيقاف الإشعارات');
      return true;
    } catch (e) {
      console.error('[Firebase] Unsubscribe error:', e);
      toast.error('حدث خطأ أثناء إيقاف الإشعارات');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    isSupported,
    isSubscribed,
    permission,
    loading,
    initialized,
    subscribe,
    unsubscribe,
  };
};
