// Firebase Cloud Messaging Service Worker
// يستقبل الإشعارات في الخلفية حتى عندما يكون الموقع مغلقاً

importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyD5iWweiKgE4JqcmlwouSuR1i569mpJqUU',
  authDomain: 'kotobi-notifications.firebaseapp.com',
  projectId: 'kotobi-notifications',
  storageBucket: 'kotobi-notifications.firebasestorage.app',
  messagingSenderId: '448918882174',
  appId: '1:448918882174:web:6e272f3b99a3fd345ed52f',
});

const messaging = firebase.messaging();

// استقبال الإشعارات في الخلفية
// ملاحظة: عندما يحتوي الـ payload على notification field فإن FCM يعرضه تلقائياً،
// لذلك لا نعرضه مرتين. نعرض يدوياً فقط عند وصول data-only push.
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw] Background message:', payload);

  // إذا كان هناك notification field، FCM SDK سيعرضه تلقائياً
  if (payload.notification) return;

  const title = payload.data?.title || 'إشعار جديد';
  const body = payload.data?.body || '';
  const targetUrl = payload.data?.url || payload.fcmOptions?.link || '/';

  const options = {
    body,
    icon: '/lovable-uploads/5882b036-f2e2-4fec-bc07-9ee97960056a.png',
    badge: '/favicon.png',
    dir: 'rtl',
    lang: 'ar',
    tag: payload.data?.tag || 'kotobi-notification',
    data: { url: targetUrl },
  };

  self.registration.showNotification(title, options);
});

// النقر على الإشعار يفتح الموقع
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
