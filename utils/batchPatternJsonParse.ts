/**
 * Parses catalog batch-extraction JSON from Gemini. Repairs common invalid
 * numeric tokens (e.g. `"totalRows": 20-25`) before giving up.
 */

const BATCH_NUMERIC_FIELDS =
  'estimatedTimeMinutes|totalRows|stitchesPerRow|videoIndex|seconds';

export type BatchPatternsJson = {
  patterns?: unknown[];
};

function extractOuterJsonObject(raw: string): string | null {
  const trimmed = raw.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  return trimmed.slice(start, end + 1);
}

/** Fixes trailing commas and range-like numbers on known integer fields. */
export function repairBatchPatternJson(text: string): string {
  let out = text.replace(/,(\s*[}\]])/g, '$1');
  out = out.replace(
    new RegExp(
      `("(?:${BATCH_NUMERIC_FIELDS})"\\s*:\\s*)(-?\\d+(?:\\.\\d+)?)\\s*-\\s*\\d+(?:\\.\\d+)?`,
      'g',
    ),
    '$1$2',
  );
  out = out.replace(
    new RegExp(`("(?:${BATCH_NUMERIC_FIELDS})"\\s*:\\s*)-(?=[\\s,}\\]])`, 'g'),
    '$1null',
  );
  return out;
}

function uniqueNonEmpty(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

export function parseBatchPatternsResponse(raw: string): BatchPatternsJson {
  const outer = extractOuterJsonObject(raw);
  const candidates = uniqueNonEmpty([
    raw,
    outer ?? '',
    repairBatchPatternJson(raw),
    outer ? repairBatchPatternJson(outer) : '',
  ]);

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new SyntaxError('Expected a JSON object with a patterns array');
      }
      return parsed as BatchPatternsJson;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new SyntaxError('Invalid batch patterns JSON');
}
