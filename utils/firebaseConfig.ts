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

/** app.json ships empty firebase placeholders; ?? alone would block EXPO_PUBLIC_* fallbacks. */
function pickConfigValue(...candidates: (string | undefined)[]): string {
  for (const value of candidates) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return '';
}

export const firebaseConfig: FirebaseClientConfig = {
  apiKey: pickConfigValue(extra.firebaseConfig?.apiKey, process.env.EXPO_PUBLIC_FIREBASE_API_KEY),
  authDomain: pickConfigValue(extra.firebaseConfig?.authDomain, process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN),
  projectId: pickConfigValue(extra.firebaseConfig?.projectId, process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID),
  storageBucket: pickConfigValue(
    extra.firebaseConfig?.storageBucket,
    process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  ),
  messagingSenderId: pickConfigValue(
    extra.firebaseConfig?.messagingSenderId,
    process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  ),
  appId: pickConfigValue(extra.firebaseConfig?.appId, process.env.EXPO_PUBLIC_FIREBASE_APP_ID),
};

export function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
}
