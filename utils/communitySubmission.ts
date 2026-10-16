/**
 * Anonymous relay of a cleaned pattern into Firestore `community_submissions`.
 *
 * The payload is the catalog fields only. Account ids, email, and display
 * names are never written.
 */
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

import { isYarnWeight } from '@/store/machine';
import { db, isFirebaseConfigured } from '@/utils/firebase';
import { reviewCrochetPattern } from '@/utils/crochetReview';
import { cleanPatternText, isPatternVideoSource, normalizeHttpUrl, type PatternVideoSource } from '@/utils/patternAiParser';

const MAX_STEPS = 16;
const MAX_STEP_CHARS = 180;

export type CommunitySubmissionInput = {
  title: string;
  steps: readonly string[];
  hookSize: string;
  yarnWeight: string;
  source: PatternVideoSource;
  videoUrl: string;
};

export type CommunitySubmissionPayload = {
  title: string;
  steps: string[];
  hookSize: string;
  yarnWeight: string;
  source: PatternVideoSource;
  videoUrl: string;
  status: 'pending';
};

export function buildCommunitySubmissionPayload(input: CommunitySubmissionInput): CommunitySubmissionPayload | null {
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
    status: 'pending',
  };
}

/** Writes one pending submission. Crochet review happens again before the catalog merge. */
export async function submitCommunityPattern(input: CommunitySubmissionInput): Promise<boolean> {
  const payload = buildCommunitySubmissionPayload(input);
  if (!payload || !reviewCrochetPattern(payload).ok || !isFirebaseConfigured() || !db) return false;
  await addDoc(collection(db, 'community_submissions'), {
    title: payload.title,
    steps: payload.steps,
    hookSize: payload.hookSize,
    yarnWeight: payload.yarnWeight,
    source: payload.source,
    videoUrl: payload.videoUrl,
    submittedAt: serverTimestamp(),
    status: payload.status,
  });
  return true;
}

function toPublicHttpsUrl(value: string): string | null {
  const normalized = normalizeHttpUrl(value);
  if (!normalized) return null;
  const https = normalized.replace(/^http:\/\//i, 'https://');
  return https.startsWith('https://') ? https : null;
}
