/**
 * Anonymous relay of a cleaned pattern into Firestore `community_submissions`.
 *
 * The payload is the catalog fields only. Account ids, email, and display
 * names are never written. Submission times live on this device so a burst
 * of saves cannot spend the Gemini quota.
 */
import { isYarnWeight } from '@/store/machine';
import { preFilterSubmission, reviewCrochetPattern } from '@/utils/crochetReview';
import {
  cleanPatternText,
  communityPublishStatus,
  isPatternVideoSource,
  normalizeHttpUrl,
  reviewAndParsePattern,
  type PatternVideoSource,
} from '@/utils/patternAiParser';

const MAX_STEPS = 16;
const MAX_STEP_CHARS = 180;
const SUBMISSION_TIME_KEY = 'crochet-handy.community-submission-times';

export const COMMUNITY_SUBMISSION_LIMIT = 5;
export const COMMUNITY_SUBMISSION_WINDOW_MS = 24 * 60 * 60 * 1000;

export type CommunityWriteStatus = 'pending' | 'published' | 'rejected';

export type CommunitySubmissionInput = {
  title: string;
  steps: readonly string[];
  hookSize: string;
  yarnWeight: string;
  source: PatternVideoSource;
  videoUrl: string;
  /** Pasted pattern text. The model sees this once, after the local gates pass. */
  rawText: string;
};

export type CommunitySubmissionPayload = {
  title: string;
  steps: string[];
  hookSize: string;
  yarnWeight: string;
  source: PatternVideoSource;
  videoUrl: string;
  status: CommunityWriteStatus;
};

export type CommunitySubmitResult = 'published' | 'rejected' | 'rate-limited' | 'not-crochet' | 'unavailable';

/** Keeps timestamps inside the rolling day. Times in the future are ignored. */
export function pruneCommunitySubmissionTimes(timestamps: readonly number[], now: number): number[] {
  const cutoff = now - COMMUNITY_SUBMISSION_WINDOW_MS;
  return timestamps.filter((ts) => Number.isFinite(ts) && ts > cutoff && ts <= now);
}

export function canRecordCommunitySubmission(timestamps: readonly number[], now: number): boolean {
  return pruneCommunitySubmissionTimes(timestamps, now).length < COMMUNITY_SUBMISSION_LIMIT;
}

export function buildCommunitySubmissionPayload(
  input: CommunitySubmissionInput,
  status: CommunityWriteStatus = 'pending',
): CommunitySubmissionPayload | null {
  if (!isPatternVideoSource(input.source) || !isYarnWeight(input.yarnWeight)) return null;
  const title = cleanPatternText(input.title, 120);
  const videoUrl = toPublicHttpsUrl(input.videoUrl);
  if (!title || !videoUrl) return null;
  const steps: string[] = [];
  const seen = new Set<string>();
  for (const step of input.steps) {
    const clean = cleanPatternText(step, MAX_STEP_CHARS);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    steps.push(clean);
    if (steps.length >= MAX_STEPS) break;
  }
  if (steps.length === 0) return null;
  return {
    title,
    steps,
    hookSize: input.hookSize.replace(/\s+/g, ' ').trim().slice(0, 32),
    yarnWeight: input.yarnWeight,
    source: input.source,
    videoUrl,
    status,
  };
}

/**
 * Reviews once, then writes `published` or `rejected`. Rejected rows are stored
 * so they are not merged into the public catalog. The Gemini call runs only
 * after the local pre-filter and the 5-per-day cap both pass.
 */
export async function submitCommunityPattern(input: CommunitySubmissionInput): Promise<CommunitySubmitResult> {
  if (!preFilterSubmission(input.rawText).ok) return 'not-crochet';
  const firebase = await import('@/utils/firebase');
  if (!firebase.isFirebaseConfigured() || !firebase.db) return 'unavailable';
  const claimedAt = await claimCommunitySubmissionSlot();
  if (claimedAt == null) return 'rate-limited';

  const attempt = await reviewAndParsePattern(input.rawText);
  if (!attempt.called) {
    await releaseCommunitySubmissionSlot(claimedAt);
    return 'unavailable';
  }
  const review = attempt.review;
  if (!review) return 'unavailable';

  let status = communityPublishStatus(review);
  const yarnWeight = isYarnWeight(review.yarnWeight) ? review.yarnWeight : input.yarnWeight;
  const payload = buildCommunitySubmissionPayload(
    {
      title: review.title.trim() || input.title,
      steps: review.steps.length > 0 ? review.steps : input.steps,
      hookSize: review.hookSize.trim() || input.hookSize,
      yarnWeight,
      source: input.source,
      videoUrl: input.videoUrl,
      rawText: input.rawText,
    },
    status,
  );
  if (!payload) return 'unavailable';
  if (status === 'published' && !reviewCrochetPattern(payload).ok) status = 'rejected';

  const { addDoc, collection, serverTimestamp } = await import('firebase/firestore');
  await addDoc(collection(firebase.db, 'community_submissions'), {
    title: payload.title,
    steps: payload.steps,
    hookSize: payload.hookSize,
    yarnWeight: payload.yarnWeight,
    source: payload.source,
    videoUrl: payload.videoUrl,
    submittedAt: serverTimestamp(),
    status,
  });
  return status;
}

async function claimCommunitySubmissionSlot(now = Date.now()): Promise<number | null> {
  const stored = await readSubmissionTimes();
  if (!stored) return null;
  const recent = pruneCommunitySubmissionTimes(stored, now);
  if (!canRecordCommunitySubmission(recent, now)) {
    await writeSubmissionTimes(recent);
    return null;
  }
  const wrote = await writeSubmissionTimes([...recent, now]);
  return wrote ? now : null;
}

async function releaseCommunitySubmissionSlot(stamp: number): Promise<void> {
  const stored = await readSubmissionTimes();
  if (!stored) return;
  await writeSubmissionTimes(stored.filter((ts) => ts !== stamp));
}

async function readSubmissionTimes(): Promise<number[] | null> {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    const raw = await AsyncStorage.getItem(SUBMISSION_TIME_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  } catch {
    return null;
  }
}

async function writeSubmissionTimes(timestamps: number[]): Promise<boolean> {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.setItem(SUBMISSION_TIME_KEY, JSON.stringify(timestamps.slice(-COMMUNITY_SUBMISSION_LIMIT)));
    return true;
  } catch {
    return false;
  }
}

function toPublicHttpsUrl(value: string): string | null {
  const normalized = normalizeHttpUrl(value);
  if (!normalized) return null;
  const https = normalized.replace(/^http:\/\//i, 'https://');
  return https.startsWith('https://') ? https : null;
}
