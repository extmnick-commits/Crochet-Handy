import {
  collectReferencedPatternIds,
  reconcilePatternCatalog,
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
  const remote = await fetchRemotePatternCatalog();
  const retain = collectReferencedPatternIds(data);
  const merged = reconcilePatternCatalog(data.patterns, bundledCatalog, remote, retain);
  if (merged.length === data.patterns.length && merged.every((p, i) => p.id === data.patterns[i]?.id)) {
    return 0;
  }
  apply({ ...data, patterns: merged });
  return merged.length - before;
}

/** Fetches CDN catalog and overlays metadata onto the bundled seed allowlist. */
export async function syncRemotePatternCatalog(
  readState: () => CrochetData,
  apply: (next: CrochetData) => void,
  bundledCatalog: CrochetPattern[],
): Promise<void> {
  await pullPatternCatalogUpdates(readState, apply, bundledCatalog);
}
