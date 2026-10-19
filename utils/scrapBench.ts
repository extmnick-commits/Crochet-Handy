/**
 * Compare two on-device runs of the same scrap inputs.
 * A winner is reported only when every shared run has latency and peak memory.
 */

export type ScrapBenchEntry = {
  modelId: string;
  downloadBytes: number;
  inputId: string;
  valid: boolean;
  violations: number;
  latencyMs: number | null;
  peakMemoryBytes: number | null;
  gpu: boolean;
  devices: string[];
  reasonNoGPU: string;
};

export type ScrapBenchScore = {
  modelId: string;
  downloadBytes: number;
  runs: number;
  validRate: number | null;
  violations: number;
  medianLatencyMs: number | null;
  peakMemoryBytes: number | null;
};

export type ScrapModelComparison = {
  current: ScrapBenchScore;
  smaller: ScrapBenchScore;
  sharedInputs: number;
  winner: string | null;
  reason: string;
};

export function scoreBenchEntries(entries: readonly ScrapBenchEntry[]): ScrapBenchScore {
  const first = entries[0];
  const valid = entries.filter((entry) => entry.valid).length;
  const latencies = entries.map((entry) => entry.latencyMs).filter((value): value is number => value != null);
  const memories = entries.map((entry) => entry.peakMemoryBytes).filter((value): value is number => value != null);
  return {
    modelId: first?.modelId ?? 'unknown',
    downloadBytes: first?.downloadBytes ?? 0,
    runs: entries.length,
    validRate: entries.length > 0 ? valid / entries.length : null,
    violations: entries.reduce((sum, entry) => sum + entry.violations, 0),
    medianLatencyMs: latencies.length === entries.length && entries.length > 0 ? median(latencies) : null,
    peakMemoryBytes: memories.length === entries.length && entries.length > 0 ? Math.max(...memories) : null,
  };
}

export function compareScrapModelLogs(
  current: readonly ScrapBenchEntry[],
  smaller: readonly ScrapBenchEntry[],
): ScrapModelComparison {
  const currentByInput = new Map(current.map((entry) => [entry.inputId, entry]));
  const smallerByInput = new Map(smaller.map((entry) => [entry.inputId, entry]));
  const sharedIds = [...currentByInput.keys()].filter((id) => smallerByInput.has(id)).sort();
  const sharedCurrent = sharedIds.map((id) => currentByInput.get(id)!);
  const sharedSmaller = sharedIds.map((id) => smallerByInput.get(id)!);
  const currentScore = scoreBenchEntries(sharedCurrent);
  const smallerScore = scoreBenchEntries(sharedSmaller);
  const measured =
    sharedIds.length > 0 &&
    currentScore.medianLatencyMs != null &&
    smallerScore.medianLatencyMs != null &&
    currentScore.peakMemoryBytes != null &&
    smallerScore.peakMemoryBytes != null &&
    currentScore.validRate != null &&
    smallerScore.validRate != null;
  if (!measured) {
    return {
      current: currentScore,
      smaller: smallerScore,
      sharedInputs: sharedIds.length,
      winner: null,
      reason: 'Peak memory or latency is missing, so this comparison does not name a faster or better model.',
    };
  }
  const winner = pickWinner(currentScore, smallerScore);
  return {
    current: currentScore,
    smaller: smallerScore,
    sharedInputs: sharedIds.length,
    winner: winner?.modelId ?? null,
    reason: winner
      ? `${winner.modelId} ranked higher on the supplied device logs (valid output, then latency, then peak memory). This is not a general claim.`
      : 'The supplied device logs do not separate the two models.',
  };
}

function pickWinner(current: ScrapBenchScore, smaller: ScrapBenchScore): ScrapBenchScore | null {
  const validGap = (current.validRate ?? 0) - (smaller.validRate ?? 0);
  if (validGap > 0) return current;
  if (validGap < 0) return smaller;
  const latencyGap = (current.medianLatencyMs ?? 0) - (smaller.medianLatencyMs ?? 0);
  if (latencyGap < 0) return current;
  if (latencyGap > 0) return smaller;
  const memoryGap = (current.peakMemoryBytes ?? 0) - (smaller.peakMemoryBytes ?? 0);
  if (memoryGap < 0) return current;
  if (memoryGap > 0) return smaller;
  return null;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}
