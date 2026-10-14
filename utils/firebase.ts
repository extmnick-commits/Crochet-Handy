/**
 * Firebase (web). Native uses firebase.native.ts for AsyncStorage persistence.
 */
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

import { firebaseConfig, isFirebaseConfigured } from './firebaseConfig';

export { firebaseConfig, isFirebaseConfigured, type FirebaseClientConfig } from './firebaseConfig';

function createAuth(app: FirebaseApp): Auth {
  return getAuth(app);
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
