/**
 * Keeps Firebase Auth and the user's Firestore document in sync with Zustand.
 */
import { useEffect, useRef } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

import {
  partializeCrochetState,
  useCrochetHydrated,
  useCrochetStore,
  type UserAccount,
} from '@/store/useCrochetStore';
import { auth, db, isFirebaseConfigured } from '@/utils/firebase';

const SYNC_DEBOUNCE_MS = 800;

function accountFromUser(user: User, profile?: Partial<UserAccount>): UserAccount {
  const now = Date.now();
  return {
    uid: user.uid,
    email: user.email ?? profile?.email ?? '',
    displayName: profile?.displayName ?? user.displayName ?? 'Crochet Maker',
    username: profile?.username ?? defaultUsername(user),
    bio: profile?.bio ?? '',
    avatarColor: profile?.avatarColor ?? '#2F6B4F',
    updatedAt: profile?.updatedAt ?? now,
  };
}

function defaultUsername(user: User): string {
  const fromEmail = user.email?.split('@')[0] ?? '';
  const cleaned = fromEmail.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 32);
  if (cleaned.length >= 2) return cleaned;
  return `maker${user.uid.slice(0, 6)}`;
}

function cloudAccountFromDoc(raw: Record<string, unknown>, user: User): UserAccount | null {
  const nested = raw.account;
  if (nested && typeof nested === 'object' && nested !== null) {
    const profile = nested as Partial<UserAccount>;
    if (typeof profile.uid === 'string' && profile.uid === user.uid) {
      return accountFromUser(user, profile);
    }
  }
  return accountFromUser(user, {
    uid: user.uid,
    email: typeof raw.email === 'string' ? raw.email : user.email ?? '',
    displayName: typeof raw.displayName === 'string' ? raw.displayName : undefined,
    username: typeof raw.username === 'string' ? raw.username : undefined,
    bio: typeof raw.bio === 'string' ? raw.bio : undefined,
    avatarColor: typeof raw.avatarColor === 'string' ? raw.avatarColor : undefined,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : undefined,
  });
}

export function FirebaseAccountSync() {
  const hydrated = useCrochetHydrated();
  const hydrateFromCloud = useCrochetStore((state) => state.hydrateFromCloud);
  const setAccount = useCrochetStore((state) => state.setAccount);
  const setAuthSessionReady = useCrochetStore((state) => state.setAuthSessionReady);
  const skipRemoteWrite = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!hydrated) return undefined;

    if (!isFirebaseConfigured() || !auth || !db) {
      setAuthSessionReady(true);
      return undefined;
    }

    const firestore = db;
    setAuthSessionReady(false);

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      try {
        if (!user) {
          setAccount(null);
          return;
        }

        const ref = doc(firestore, 'users', user.uid);
        const snap = await getDoc(ref);
        skipRemoteWrite.current = true;

        if (snap.exists()) {
          const raw = snap.data() as Record<string, unknown>;
          hydrateFromCloud(raw);
          setAccount(cloudAccountFromDoc(raw, user));
        } else {
          const state = useCrochetStore.getState();
          const account = accountFromUser(user, state.account ?? undefined);
          setAccount(account);
          const payload = {
            ...partializeCrochetState(state),
            account,
            updatedAt: Date.now(),
          };
          await setDoc(ref, payload, { merge: true });
        }

        setTimeout(() => {
          skipRemoteWrite.current = false;
        }, SYNC_DEBOUNCE_MS + 120);
      } finally {
        setAuthSessionReady(true);
      }
    });

    const unsubscribeStore = useCrochetStore.subscribe((state) => {
      if (skipRemoteWrite.current) return;
      const uid = state.account?.uid;
      if (!uid) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const latest = useCrochetStore.getState();
        if (!latest.account || latest.account.uid !== uid) return;
        const ref = doc(firestore, 'users', uid);
        void setDoc(
          ref,
          {
            ...partializeCrochetState(latest),
            updatedAt: Date.now(),
          },
          { merge: true },
        );
      }, SYNC_DEBOUNCE_MS);
    });

    return () => {
      unsubscribeAuth();
      unsubscribeStore();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [hydrated, hydrateFromCloud, setAccount, setAuthSessionReady]);

  return null;
}
