/**
 * Prunes seed entries whose YouTube thumbnails fail feed vision checks (Gemini):
 * non-English on-image text, yarn-only product shots, etc.
 *
 * Run: npm run prune-non-english-thumbnails
 * Dry run: npm run prune-non-english-thumbnails -- --dry-run
 */
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import dotenv from 'dotenv';

import { SEED_PATTERNS, type SeedPattern } from '../store/seed';
import { partitionVideosByEnglishThumbnailText } from '../utils/thumbnailEnglishFilter';
import { pruneSeedPatternsSource } from './prune-non-english-patterns';
import { buildAiClient } from './update-patterns';

const ROOT = path.resolve(__dirname, '..');
const SEED_FILE = path.join(ROOT, 'store', 'seed.ts');

dotenv.config({ path: path.join(ROOT, '.env') });

type ThumbnailCandidate = {
  id: string;
  pattern: SeedPattern;
};

function toCandidates(patterns: SeedPattern[]): ThumbnailCandidate[] {
  return patterns.map((pattern) => ({
    id: pattern.videoId,
    pattern,
  }));
}

export async function partitionSeedByThumbnailLanguage(
  patterns: SeedPattern[],
): Promise<{ kept: SeedPattern[]; removed: SeedPattern[] }> {
  const { client, model } = buildAiClient(false);
  const candidates = toCandidates(patterns);
  const { kept: keptCandidates, rejected } = await partitionVideosByEnglishThumbnailText(
    client,
    model,
    candidates,
  );
  return {
    kept: keptCandidates.map((item) => item.pattern),
    removed: rejected.map((item) => item.pattern),
  };
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const startedAt = Date.now();

  console.log(
    `Screening ${SEED_PATTERNS.length} seed thumbnails (language + yarn-only shots)…`,
  );
  const { kept, removed } = await partitionSeedByThumbnailLanguage(SEED_PATTERNS);

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(
    `Done in ${elapsed}s — ${kept.length} kept, ${removed.length} removed (thumbnail text)`,
  );
  for (const pattern of removed) {
    console.log(`  − ${pattern.id} | ${pattern.title.slice(0, 72)}`);
  }

  if (removed.length === 0) {
    console.log('Nothing to prune.');
    return;
  }

  if (dryRun) {
    console.log('Dry run — seed.ts unchanged.');
    return;
  }

  const seedSource = fs.readFileSync(SEED_FILE, 'utf8');
  const nextSource = pruneSeedPatternsSource(seedSource, kept);
  fs.writeFileSync(SEED_FILE, nextSource, 'utf8');
  console.log(`Updated ${SEED_FILE}`);

  execSync('npm run export-pattern-catalog', { cwd: ROOT, stdio: 'inherit' });
}

if (require.main === module) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
