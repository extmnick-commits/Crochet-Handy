/**
 * Firebase app singleton. When keys are missing, exports null handles so the app
 * keeps running in local-only mode.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { initializeApp, getApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, initializeAuth, type Auth, type Persistence } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { Platform } from 'react-native';

export type FirebaseClientConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

const extra = (Constants.expoConfig?.extra ?? Constants.manifest2?.extra ?? {}) as {
  firebaseConfig?: Partial<FirebaseClientConfig>;
};

export const firebaseConfig: FirebaseClientConfig = {
  apiKey: extra.firebaseConfig?.apiKey ?? process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? '',
  authDomain: extra.firebaseConfig?.authDomain ?? process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: extra.firebaseConfig?.projectId ?? process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '',
  storageBucket: extra.firebaseConfig?.storageBucket ?? process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId:
    extra.firebaseConfig?.messagingSenderId ?? process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: extra.firebaseConfig?.appId ?? process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '',
};

export function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
}

type ReactNativeAuthModule = {
  getReactNativePersistence: (storage: typeof AsyncStorage) => unknown;
  initializeAuth: typeof initializeAuth;
  getAuth: typeof getAuth;
};

function createAuth(app: FirebaseApp): Auth {
  if (Platform.OS === 'web') {
    return getAuth(app);
  }
  try {
    const rnAuth = require('@firebase/auth/dist/rn/index.js') as ReactNativeAuthModule;
    return rnAuth.initializeAuth(app, {
      persistence: rnAuth.getReactNativePersistence(AsyncStorage) as Persistence,
    });
  } catch {
    return getAuth(app);
  }
}

function initFirebase(): { app: FirebaseApp; auth: Auth; db: Firestore } | null {
  if (!isFirebaseConfigured()) return null;
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  const authInstance = createAuth(app);
  const db = getFirestore(app);
  return { app, auth: authInstance, db };
}

const handles = initFirebase();

export const firebaseApp: FirebaseApp | null = handles?.app ?? null;
export const auth: Auth | null = handles?.auth ?? null;
export const db: Firestore | null = handles?.db ?? null;
