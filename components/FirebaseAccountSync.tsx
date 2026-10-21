/**
 * Keeps Firebase Auth and the user's Firestore document in sync with Zustand.
 */
import { useEffect, useRef } from 'react';
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

/** Drops stale feed entries saved in Firestore before catalog rules tightened. */
function reconcilePatternsAfterCloudHydrate(): void {
  void pullPatternCatalogUpdates(
    readCrochetDataFromStore,
    (next) => {
      useCrochetStore.setState((state) => ({ ...state, patterns: next.patterns }));
    },
    createSeedData().patterns,
  );
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
      if (user) {
        setAuthSessionReady(false);
      }
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
          hydrateFromCloud(withoutNestedQuota(raw));
          reconcilePatternsAfterCloudHydrate();
          const account = cloudAccountFromDoc(raw, user);
          const quota = await readAuthoritativeQuota(user.uid, raw);
          setAccount({ ...account, ...quota });
          try {
            await setDoc(ref, firestorePayloadFromStore(account), { merge: true });
          } catch {
            // Profile is already in memory; a denied merge must not block sign-in.
          }
        } else {
          const state = useCrochetStore.getState();
          const account = accountFromUser(user, state.account ?? undefined);
          setAccount(account);
          try {
            await setDoc(ref, firestorePayloadFromStore(account, true), { merge: true });
          } catch {
            // Same as above — user can use the app with a local profile mirror.
          }
          reconcilePatternsAfterCloudHydrate();
        }

        setTimeout(() => {
          skipRemoteWrite.current = false;
        }, SYNC_DEBOUNCE_MS + 120);
      } catch {
        if (user) {
          setAccount(accountFromUser(user));
          reconcilePatternsAfterCloudHydrate();
        }
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
