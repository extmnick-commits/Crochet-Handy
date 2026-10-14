/**
 * Firebase (iOS / Android) with React Native auth persistence.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, initializeAuth, type Auth, type Persistence } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

import { firebaseConfig, isFirebaseConfigured } from './firebaseConfig';

export { firebaseConfig, isFirebaseConfigured, type FirebaseClientConfig } from './firebaseConfig';

function createAuth(app: FirebaseApp): Auth {
  try {
    const rnAuth = require('@firebase/auth/dist/rn/index.js') as {
      getReactNativePersistence: (storage: typeof AsyncStorage) => Persistence;
    };
    return initializeAuth(app, {
      persistence: rnAuth.getReactNativePersistence(AsyncStorage),
    });
  } catch {
    return getAuth(app);
  }
}

function initFirebase(): { app: FirebaseApp; auth: Auth; db: Firestore } | null {
  if (!isFirebaseConfigured()) return null;
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return { app, auth: createAuth(app), db: getFirestore(app) };
}

const handles = initFirebase();

export const firebaseApp: FirebaseApp | null = handles?.app ?? null;
export const auth: Auth | null = handles?.auth ?? null;
export const db: Firestore | null = handles?.db ?? null;
