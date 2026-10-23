/** Round-robin screened candidates so one popular bucket cannot crowd out the others. */
export function selectVarietyCandidates<T extends { id?: string }>(
  candidates: readonly T[],
  topicByVideoId: ReadonlyMap<string, string>,
  limit: number,
): T[] {
  const buckets = new Map<string, T[]>();
  for (const candidate of candidates) {
    const topic = topicByVideoId.get(candidate.id ?? '') ?? 'other';
    const bucket = buckets.get(topic) ?? [];
    bucket.push(candidate);
    buckets.set(topic, bucket);
  }
  const result: T[] = [];
  for (let round = 0; result.length < limit; round += 1) {
    let added = false;
    for (const bucket of buckets.values()) {
      const candidate = bucket[round];
      if (!candidate) continue;
      result.push(candidate);
      added = true;
      if (result.length >= limit) break;
    }
    if (!added) break;
  }
  return result;
}
