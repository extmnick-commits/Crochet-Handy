import { mergeCatalogPatternsFromSeed, type CrochetData } from '@/store/machine';
import { fetchRemotePatternCatalog } from '@/utils/patternCatalog';

/** Pulls the latest scraped catalog and merges new tutorials into local storage. */
export async function syncRemotePatternCatalog(
  readState: () => CrochetData,
  apply: (next: CrochetData) => void,
): Promise<void> {
  const remote = await fetchRemotePatternCatalog();
  if (remote.length === 0) return;

  const data = readState();
  const merged = mergeCatalogPatternsFromSeed(data.patterns, remote);
  if (merged.length === data.patterns.length) return;

  apply({ ...data, patterns: merged });
}
