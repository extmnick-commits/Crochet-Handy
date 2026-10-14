import Constants from 'expo-constants';

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
