/**
 * Dev helpers for exercising the daily upload cap without shipping test UI in production.
 */
import {
  createId,
  DAILY_UPLOAD_LIMIT,
  DEFAULT_UPLOAD_QUOTA,
  type UploadQuota,
} from '@/store/machine';
import { useCrochetStore } from '@/store/useCrochetStore';
import { reserveDailyUpload } from '@/utils/uploadQuota';

export function uploadsRemainingToday(quota: UploadQuota | null, now = Date.now()): number | null {
  if (!quota) return null;
  if (quota.membershipTier === 'premium') return null;
  if (quota.lastUploadDate == null) return DAILY_UPLOAD_LIMIT;
  const sameDay = new Date(quota.lastUploadDate).toISOString().slice(0, 10) === new Date(now).toISOString().slice(0, 10);
  if (!sameDay) return DAILY_UPLOAD_LIMIT;
  return Math.max(0, DAILY_UPLOAD_LIMIT - quota.dailyUploadCount);
}

export function simulatedDailyLimitQuota(now = Date.now()): UploadQuota {
  return {
    membershipTier: 'basic',
    dailyUploadCount: DAILY_UPLOAD_LIMIT,
    lastUploadDate: now,
  };
}

/** Sets the cap on this device so add-pattern / add-yarn sheets show the paywall. */
export function simulateDailyUploadLimitOnDevice(now = Date.now()): void {
  useCrochetStore.getState().setUploadQuota(simulatedDailyLimitQuota(now));
}

export function resetDailyUploadLimitOnDevice(): void {
  useCrochetStore.getState().setUploadQuota({ ...DEFAULT_UPLOAD_QUOTA });
}

/**
 * Burns real upload slots in Firestore (one yarn stub per slot). Requires deployed
 * rules and a provisioned Firestore database. Updates local quota from each success.
 */
export async function seedFirestoreUploadCap(slots = DAILY_UPLOAD_LIMIT): Promise<{ ok: number; limited: boolean }> {
  let ok = 0;
  for (let slot = 0; slot < slots; slot += 1) {
    const docId = createId('yarn');
    const reserved = await reserveDailyUpload({
      kind: 'yarn',
      docId,
      brand: 'Quota test',
      colorName: `Slot ${slot + 1}`,
      hexColor: '#C6A36E',
      yarnWeight: 'worsted',
      skeinCount: 1,
    });
    if (reserved.status === 'limit') return { ok, limited: true };
    if (reserved.status !== 'server' && reserved.status !== 'local') return { ok, limited: false };
    if (reserved.status === 'server') useCrochetStore.getState().setUploadQuota(reserved.quota);
    if (reserved.status === 'local') useCrochetStore.getState().recordLocalUpload();
    ok += 1;
  }
  return { ok, limited: ok >= slots };
}
