/**
 * Removes non-English seed catalog entries (non-Latin script, Shorts titles).
 *
 * Run: npx tsx scripts/prune-non-english-patterns.ts
 * Dry run: npx tsx scripts/prune-non-english-patterns.ts --dry-run
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

import { SEED_PATTERNS, type SeedPattern } from '../store/seed';
import { isValidEnglishSeedPattern } from '../utils/patternEnglishFilter';
import {
  formatSeedPatternsExport,
  replaceSeedPatternsBlock,
  type SeedPattern as ExportSeedPattern,
} from './update-patterns';

const ROOT = path.resolve(__dirname, '..');
const SEED_FILE = path.join(ROOT, 'store', 'seed.ts');

function partitionPatterns(patterns: SeedPattern[]): {
  kept: SeedPattern[];
  removed: SeedPattern[];
} {
  const kept: SeedPattern[] = [];
  const removed: SeedPattern[] = [];
  for (const pattern of patterns) {
    const valid = isValidEnglishSeedPattern({
      title: pattern.title,
      description: pattern.description,
      author: pattern.author,
    });
    if (valid) kept.push(pattern);
    else removed.push(pattern);
  }
  return { kept, removed };
}

function toExportSeedPattern(pattern: SeedPattern): ExportSeedPattern {
  return { ...pattern, bookmarks: pattern.bookmarks ?? [] };
}

export function pruneSeedPatternsSource(seedSource: string, patterns: SeedPattern[]): string {
  const block = formatSeedPatternsExport(patterns.map(toExportSeedPattern));
  return replaceSeedPatternsBlock(seedSource, block);
}

function main(): void {
  const dryRun = process.argv.includes('--dry-run');
  const { kept, removed } = partitionPatterns(SEED_PATTERNS);

  console.log(`Seed patterns: ${SEED_PATTERNS.length} total, ${kept.length} kept, ${removed.length} removed`);
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
  main();
}
