/** Prefer the latest published snapshot, even after cleanup makes it smaller. */
export function selectFreshestCatalog<T>(
  snapshots: readonly { generatedAt?: string; patterns: T[] }[],
): T[] {
  let best: T[] = [];
  let bestTimestamp = -Infinity;
  for (const snapshot of snapshots) {
    if (snapshot.patterns.length === 0) continue;
    const parsed = Date.parse(snapshot.generatedAt ?? '');
    const timestamp = Number.isFinite(parsed) ? parsed : -Infinity;
    if (best.length === 0 || timestamp > bestTimestamp) {
      best = snapshot.patterns;
      bestTimestamp = timestamp;
    }
  }
  return best;
}
