/**
 * Reserves one daily upload and creates the pattern or yarn document together.
 *
 * Basic accounts get 3 creates per UTC day. Premium skips the counter. Only the
 * Admin SDK can set `membershipTier` to `premium` on `users/{uid}` or
 * `users/{uid}/quota/current`. Client writes cannot change that tier.
 */
import { doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore';

import {
  canUploadToday,
  DEFAULT_UPLOAD_QUOTA,
  isYarnWeight,
  nextBasicQuota,
  resolveUploadQuota,
  type UploadQuota,
} from '@/store/machine';
import { auth, db, isFirebaseConfigured } from '@/utils/firebase';

const DOC_ID = /^[a-z0-9-]{1,80}$/;
const HTTP_URL = /^https?:\/\/\S+$/;

export type ReservedUpload =
  | { status: 'local' }
  | { status: 'server'; quota: UploadQuota }
  | { status: 'limit'; quota: UploadQuota | null }
  | { status: 'sign-in' }
  | { status: 'error'; message: string };

export type PatternUploadInput = {
  kind: 'pattern';
  docId: string;
  title: string;
  videoUrl: string;
};

export type YarnUploadInput = {
  kind: 'yarn';
  docId: string;
  brand: string;
  colorName: string;
  hexColor: string;
  yarnWeight: string;
  skeinCount: number;
};

export async function readAuthoritativeQuota(uid: string, profile: Record<string, unknown> | null): Promise<UploadQuota> {
  if (!db) return { ...DEFAULT_UPLOAD_QUOTA };
  let quotaData: unknown = null;
  try {
    const quotaSnap = await getDoc(doc(db, 'users', uid, 'quota', 'current'));
    quotaData = quotaSnap.exists() ? quotaSnap.data() : null;
  } catch {
    // The ledger is missing until the rules are deployed, or this read was denied.
    // Profile fields still drive the client gate; the transaction enforces the cap.
    quotaData = null;
  }
  return resolveUploadQuota([quotaData, profile ? pickQuota(profile) : null]);
}

/**
 * Creates `users/{uid}/patterns|yarn/{docId}` and, for basic members, advances
 * `users/{uid}/quota/current` plus the profile mirror in one transaction.
 * Premium members only create the upload document.
 */
export async function reserveDailyUpload(input: PatternUploadInput | YarnUploadInput): Promise<ReservedUpload> {
  if (!isFirebaseConfigured() || !auth || !db) return { status: 'local' };
  const user = auth.currentUser;
  if (!user) return { status: 'sign-in' };
  if (!DOC_ID.test(input.docId)) return { status: 'error', message: 'Could not save that right now.' };

  const body = uploadBody(input);
  if (!body) return { status: 'error', message: 'Could not save that right now.' };

  const firestore = db;
  const userRef = doc(firestore, 'users', user.uid);
  const quotaRef = doc(firestore, 'users', user.uid, 'quota', 'current');
  const collectionName = input.kind === 'pattern' ? 'patterns' : 'yarn';
  const uploadRef = doc(firestore, 'users', user.uid, collectionName, input.docId);

  try {
    const outcome = await runTransaction(firestore, async (transaction) => {
      const quotaSnap = await transaction.get(quotaRef);
      const profileSnap = await transaction.get(userRef);
      const quota = resolveUploadQuota([
        quotaSnap.exists() ? quotaSnap.data() : null,
        profileSnap.exists() ? pickQuota(profileSnap.data()) : null,
      ]);
      const now = Date.now();
      if (!canUploadToday(quota, now)) return { limited: true as const, quota };

      transaction.set(uploadRef, { ...body, createdAt: serverTimestamp() });
      if (quota.membershipTier === 'premium') return { limited: false as const, quota };

      const next = nextBasicQuota(quota, now);
      if (!next) return { limited: true as const, quota };

      transaction.set(quotaRef, {
        membershipTier: 'basic',
        dailyUploadCount: next.dailyUploadCount,
        lastUploadDate: serverTimestamp(),
        lastUploadDocId: input.docId,
        lastUploadKind: input.kind,
      });
      transaction.set(
        userRef,
        {
          membershipTier: 'basic',
          dailyUploadCount: next.dailyUploadCount,
          lastUploadDate: serverTimestamp(),
        },
        { merge: true },
      );
      return { limited: false as const, quota: next };
    });

    if (outcome.limited) return { status: 'limit', quota: outcome.quota };
    return { status: 'server', quota: outcome.quota };
  } catch (error) {
    if (firebaseCode(error) === 'permission-denied' || firebaseCode(error) === 'failed-precondition') {
      try {
        const quota = await readAuthoritativeQuota(user.uid, null);
        if (!canUploadToday(quota, Date.now())) return { status: 'limit', quota };
      } catch {
        // The denied write is enough to stop the upload.
      }
    }
    return { status: 'error', message: 'Could not save that right now.' };
  }
}

function pickQuota(raw: Record<string, unknown>): Record<string, unknown> | null {
  const picked: Record<string, unknown> = {};
  if ('membershipTier' in raw) picked.membershipTier = raw.membershipTier;
  if ('dailyUploadCount' in raw) picked.dailyUploadCount = raw.dailyUploadCount;
  if ('lastUploadDate' in raw) picked.lastUploadDate = raw.lastUploadDate;
  return Object.keys(picked).length > 0 ? picked : null;
}

function uploadBody(input: PatternUploadInput | YarnUploadInput): Record<string, string | number> | null {
  if (input.kind === 'pattern') {
    const title = input.title.replace(/\s+/g, ' ').trim().slice(0, 120);
    const videoUrl = input.videoUrl.trim();
    if (!title || videoUrl.length < 12 || videoUrl.length > 500 || !HTTP_URL.test(videoUrl)) return null;
    return { title, videoUrl };
  }
  const brand = input.brand.replace(/\s+/g, ' ').trim().slice(0, 60);
  const colorName = input.colorName.replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!brand || !colorName || !isYarnWeight(input.yarnWeight)) return null;
  if (!/^#[0-9A-F]{6}$/.test(input.hexColor)) return null;
  if (!Number.isInteger(input.skeinCount) || input.skeinCount < 1 || input.skeinCount > 48) return null;
  return {
    brand,
    colorName,
    hexColor: input.hexColor,
    yarnWeight: input.yarnWeight,
    skeinCount: input.skeinCount,
  };
}

function firebaseCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) return String((error as { code: unknown }).code);
  return '';
}
