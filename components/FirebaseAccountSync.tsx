/**
 * Keeps Firebase Auth and the user's Firestore document in sync with Zustand.
 */
import { useEffect, useRef } from 'react';
import { InteractionManager } from 'react-native';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

import {
  DEFAULT_UPLOAD_QUOTA,
  fitCrochetPersistedSliceForFirestore,
  resolveUploadQuota,
  type CrochetData,
  type UserAccount,
} from '@/store/machine';
import { createSeedData } from '@/store/seed';
import { partializeCrochetState, useCrochetHydrated, useCrochetStore } from '@/store/useCrochetStore';
import { auth, db, isFirebaseConfigured } from '@/utils/firebase';
import { pullPatternCatalogUpdates } from '@/utils/syncPatternCatalog';
import { readAuthoritativeQuota } from '@/utils/uploadQuota';

const SYNC_DEBOUNCE_MS = 800;
const FIRESTORE_READ_TIMEOUT_MS = 9_000;

function readCrochetDataFromStore(): CrochetData {
  const state = useCrochetStore.getState();
  return {
    ...partializeCrochetState(state),
    tapHistory: state.tapHistory,
  };
}

function publicAccount(account: UserAccount) {
  return {
    uid: account.uid,
    email: account.email,
    displayName: account.displayName,
    username: account.username,
    bio: account.bio,
    avatarColor: account.avatarColor,
    updatedAt: account.updatedAt,
  };
}

function withoutNestedQuota(raw: Record<string, unknown>): Record<string, unknown> {
  const nested = raw.account;
  if (!nested || typeof nested !== 'object' || Array.isArray(nested)) return raw;
  const account = { ...(nested as Record<string, unknown>) };
  delete account.membershipTier;
  delete account.dailyUploadCount;
  delete account.lastUploadDate;
  return { ...raw, account };
}

function firestorePayloadFromStore(account?: UserAccount | null, initializeQuota = false) {
  const state = useCrochetStore.getState();
  const slice = fitCrochetPersistedSliceForFirestore(partializeCrochetState(state));
  const resolved = account ?? state.account;
  return {
    ...slice,
    account: resolved ? publicAccount(resolved) : null,
    updatedAt: Date.now(),
    ...(initializeQuota ? DEFAULT_UPLOAD_QUOTA : {}),
  };
}

function reconcilePatternsAfterCloudHydrate(): void {
  InteractionManager.runAfterInteractions(() => {
    void pullPatternCatalogUpdates(
      readCrochetDataFromStore,
      (next) => {
        useCrochetStore.setState((state) => ({ ...state, patterns: next.patterns }));
      },
      createSeedData().patterns,
    );
  });
}

function accountFromUser(user: User, profile?: Partial<UserAccount>, quotaSources: readonly unknown[] = []): UserAccount {
  const now = Date.now();
  const quota = resolveUploadQuota([...quotaSources, profile ?? null]);
  return {
    uid: user.uid,
    email: user.email ?? profile?.email ?? '',
    displayName: profile?.displayName ?? user.displayName ?? 'Crochet Maker',
    username: profile?.username ?? defaultUsername(user),
    bio: profile?.bio ?? '',
    avatarColor: profile?.avatarColor ?? '#2F6B4F',
    updatedAt: profile?.updatedAt ?? now,
    ...quota,
  };
}

function defaultUsername(user: User): string {
  const fromEmail = user.email?.split('@')[0] ?? '';
  const cleaned = fromEmail.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 32);
  if (cleaned.length >= 2) return cleaned;
  return `maker${user.uid.slice(0, 6)}`;
}

function cloudAccountFromDoc(raw: Record<string, unknown>, user: User): UserAccount {
  const nested = raw.account;
  if (nested && typeof nested === 'object' && nested !== null) {
    const profile = nested as Partial<UserAccount>;
    if (typeof profile.uid === 'string' && profile.uid === user.uid) {
      return accountFromUser(user, profile, [raw, nested]);
    }
  }
  return accountFromUser(
    user,
    {
      uid: user.uid,
      email: typeof raw.email === 'string' ? raw.email : user.email ?? '',
      displayName: typeof raw.displayName === 'string' ? raw.displayName : undefined,
      username: typeof raw.username === 'string' ? raw.username : undefined,
      bio: typeof raw.bio === 'string' ? raw.bio : undefined,
      avatarColor: typeof raw.avatarColor === 'string' ? raw.avatarColor : undefined,
      updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : undefined,
    },
    [raw],
  );
}

async function getDocWithTimeout(ref: ReturnType<typeof doc>) {
  return Promise.race([
    getDoc(ref),
    new Promise<Awaited<ReturnType<typeof getDoc>>>((_, reject) => {
      setTimeout(() => reject(new Error('firestore-timeout')), FIRESTORE_READ_TIMEOUT_MS);
    }),
  ]);
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
    setAuthSessionReady(true);

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setAccount(null);
        return;
      }

      skipRemoteWrite.current = true;
      const optimistic = accountFromUser(user, useCrochetStore.getState().account ?? undefined);
      setAccount(optimistic);

      void (async () => {
        try {
          const ref = doc(firestore, 'users', user.uid);
          const snap = await getDocWithTimeout(ref);

          if (snap.exists()) {
            const raw = snap.data() as Record<string, unknown>;
            InteractionManager.runAfterInteractions(() => {
              hydrateFromCloud(withoutNestedQuota(raw));
              reconcilePatternsAfterCloudHydrate();
            });
            const account = cloudAccountFromDoc(raw, user);
            const quota = await readAuthoritativeQuota(user.uid, raw);
            setAccount({ ...account, ...quota });
            await setDoc(ref, firestorePayloadFromStore(account), { merge: true });
          } else {
            const state = useCrochetStore.getState();
            const account = accountFromUser(user, state.account ?? undefined);
            setAccount(account);
            await setDoc(ref, firestorePayloadFromStore(account, true), { merge: true });
            reconcilePatternsAfterCloudHydrate();
          }
        } catch {
          // Keep optimistic account; cloud merge retries on next auth event or user action.
        } finally {
          setTimeout(() => {
            skipRemoteWrite.current = false;
          }, SYNC_DEBOUNCE_MS + 120);
          setAuthSessionReady(true);
        }
      })();
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
        void setDoc(ref, firestorePayloadFromStore(latest.account), { merge: true });
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
