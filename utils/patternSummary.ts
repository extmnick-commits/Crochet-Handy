/** Short blurb on the pattern detail screen (full description stays in seed meta). */
export const MAX_PATTERN_SUMMARY_CHARS = 160;

export function normalizePatternBlurb(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** True when the stored description adds copy beyond the summary line. */
export function patternDescriptionAddsDetail(summary: string, description: string): boolean {
  const a = normalizePatternBlurb(summary);
  const b = normalizePatternBlurb(description);
  if (!b || a === b) return false;
  if (b.startsWith(a) && b.length <= a.length + 24) return false;
  return true;
}

export function derivePatternSummary(description: string, maxChars = MAX_PATTERN_SUMMARY_CHARS): string {
  const text = description.replace(/\s+/g, ' ').trim();
  if (!text) return 'Crochet tutorial from the community library.';
  const sentence = text.match(/^[\s\S]{1,240}?[.!?](?:\s|$)/)?.[0]?.trim() ?? text;
  if (sentence.length <= maxChars) return sentence;
  const trimmed = sentence.slice(0, maxChars - 1).replace(/\s+\S*$/, '');
  return `${trimmed}…`;
}
