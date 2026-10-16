/**
 * Writes catalog/pattern-catalog.json for the mobile app.
 *
 * Seed patterns stay the base catalog. Pending Firestore `community_submissions`
 * are checked as crochet patterns, deduped, merged, and marked approved.
 * Anything that is not a crochet pattern is marked rejected and stays out of
 * the catalog. Without credentials this still publishes the seed catalog.
 *
 * Run: npm run export-pattern-catalog
 */
import * as fs from 'fs';
import * as path from 'path';

import {
  mergeCommunityPatterns,
  parseCatalogPatterns,
  patternFromCommunitySubmission,
  type CrochetPattern,
} from '../store/machine';
import { createSeedData } from '../store/seed';
import { reviewCrochetPattern } from '../utils/crochetReview';
import {
  communityCatalogPatternId,
  markCommunitySubmissionsApproved,
  markCommunitySubmissionsRejected,
  pullPendingCommunitySubmissions,
} from './communityCatalogFirestore';

const ROOT = path.resolve(__dirname, '..');
const CATALOG_DIR = path.join(ROOT, 'catalog');
const CATALOG_FILE = path.join(CATALOG_DIR, 'pattern-catalog.json');

export function readCatalogPatterns(catalogFile = CATALOG_FILE): CrochetPattern[] {
  if (!fs.existsSync(catalogFile)) return [];
  const payload = JSON.parse(fs.readFileSync(catalogFile, 'utf8')) as { patterns?: unknown };
  return parseCatalogPatterns(payload.patterns);
}

export function assemblePatternCatalog(
  seedPatterns: CrochetPattern[],
  previous: CrochetPattern[],
  incoming: CrochetPattern[],
): CrochetPattern[] {
  const preserved = previous.filter((pattern) => pattern.id.startsWith('community-'));
  return mergeCommunityPatterns(mergeCommunityPatterns(seedPatterns, preserved), incoming);
}

export async function publishPatternCatalog(): Promise<{
  patternCount: number;
  catalogFile: string;
  approved: number;
  rejected: number;
}> {
  const seedPatterns = createSeedData().patterns;
  const previous = readCatalogPatterns();
  const pending = await pullPendingCommunitySubmissions();
  const incoming: CrochetPattern[] = [];
  const approvedNames: string[] = [];
  const rejectedNames: string[] = [];
  for (const submission of pending) {
    const review = reviewCrochetPattern({ title: submission.title, steps: submission.steps });
    const id = communityCatalogPatternId(submission.title, submission.videoUrl);
    const pattern = review.ok ? patternFromCommunitySubmission(id, submission) : null;
    if (!pattern) {
      rejectedNames.push(submission.documentName);
      continue;
    }
    incoming.push(pattern);
    approvedNames.push(submission.documentName);
  }
  const patterns = assemblePatternCatalog(seedPatterns, previous, incoming);
  const payload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    patterns,
  };
  fs.mkdirSync(CATALOG_DIR, { recursive: true });
  fs.writeFileSync(CATALOG_FILE, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await markCommunitySubmissionsApproved(approvedNames);
  await markCommunitySubmissionsRejected(rejectedNames);
  return {
    patternCount: patterns.length,
    catalogFile: CATALOG_FILE,
    approved: approvedNames.length,
    rejected: rejectedNames.length,
  };
}

if (require.main === module) {
  publishPatternCatalog()
    .then(({ patternCount, catalogFile, approved, rejected }) => {
      console.log(`Wrote ${patternCount} patterns to ${catalogFile}`);
      if (approved > 0 || rejected > 0) {
        console.log(`Community sync: approved ${approved}, rejected ${rejected}`);
      }
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Community catalog sync failed.';
      console.error(message);
      process.exit(1);
    });
}
