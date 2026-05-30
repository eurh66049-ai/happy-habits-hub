import { initializeApp, getApps, getApp } from 'firebase/app';
import { getMessaging, isSupported, type Messaging } from 'firebase/messaging';

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
};

export const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY as string;

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

let messagingInstance: Messaging | null = null;

export const getMessagingIfSupported = async (): Promise<Messaging | null> => {
  if (typeof window === 'undefined') return null;
  try {
    const supported = await isSupported();
    if (!supported) return null;
    if (!messagingInstance) {
      messagingInstance = getMessaging(firebaseApp);
    }
    return messagingInstance;
  } catch (e) {
    console.error('[Firebase] Messaging not supported:', e);
    return null;
  }
};
