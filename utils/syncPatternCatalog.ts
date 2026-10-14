import {
  mergeCatalogPatternsFromSeed,
  type CrochetData,
  type CrochetPattern,
} from '@/store/machine';
import { fetchRemotePatternCatalog } from '@/utils/patternCatalog';

/** Merges bundled seed + remote catalog; returns how many new patterns were added. */
export async function pullPatternCatalogUpdates(
  readState: () => CrochetData,
  apply: (next: CrochetData) => void,
  bundledCatalog: CrochetPattern[],
): Promise<number> {
  const data = readState();
  const before = data.patterns.length;
  let merged = mergeCatalogPatternsFromSeed(data.patterns, bundledCatalog);
  const remote = await fetchRemotePatternCatalog();
  if (remote.length > 0) {
    merged = mergeCatalogPatternsFromSeed(merged, remote);
  }
  if (merged.length === data.patterns.length) return 0;
  apply({ ...data, patterns: merged });
  return merged.length - before;
}

/** Remote catalog only (after bundled seed was merged on hydrate). */
export async function syncRemotePatternCatalog(
  readState: () => CrochetData,
  apply: (next: CrochetData) => void,
): Promise<void> {
  await pullPatternCatalogUpdates(readState, apply, []);
}
