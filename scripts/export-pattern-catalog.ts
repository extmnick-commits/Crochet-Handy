/**
 * Writes catalog/pattern-catalog.json from store/seed.ts for the mobile app to fetch.
 *
 * Run: npm run export-pattern-catalog
 */
import * as fs from 'fs';
import * as path from 'path';

import { createSeedData } from '../store/seed';

const ROOT = path.resolve(__dirname, '..');
const CATALOG_DIR = path.join(ROOT, 'catalog');
const CATALOG_FILE = path.join(CATALOG_DIR, 'pattern-catalog.json');

export function writePatternCatalogFile(): { patternCount: number; catalogFile: string } {
  const patterns = createSeedData().patterns;
  const payload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    patterns,
  };
  fs.mkdirSync(CATALOG_DIR, { recursive: true });
  fs.writeFileSync(CATALOG_FILE, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return { patternCount: patterns.length, catalogFile: CATALOG_FILE };
}

if (require.main === module) {
  const { patternCount, catalogFile } = writePatternCatalogFile();
  console.log(`Wrote ${patternCount} patterns to ${catalogFile}`);
}
