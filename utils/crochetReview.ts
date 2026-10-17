/**
 * Gate for the community catalog. A submission can be saved on one device
 * either way. Only crochet instructions are allowed into the shared catalog.
 */
import { isKnittingFeedTitle } from '@/utils/patternEnglishFilter';

const CROCHET_WORD = /\bcrochet(?:ing|er|s)?\b|\bamigurumi\b/i;
const STRONG_STITCH =
  /\b(?:sc|dc|hdc|tr|dtr|sl\s*st|slip stitch|single crochet|double crochet|half double|magic ring|magic circle)\b/i;
const ROW_STEP = /\b(?:row|rnd|round)\s+\d+\b/i;
const GENERIC_STEP = /^Work \d+ rows of \d+ stitches\b/i;

export type CrochetReview = { ok: true } | { ok: false; reason: string };

/** Shown when the local gate stops a submission before any model call. */
export const PREFILTER_REJECTION_MESSAGE = "Doesn't look like a crochet pattern with stitch instructions";

const MIN_SUBMISSION_CHARS = 80;
const MAX_SUBMISSION_CHARS = 10_000;

/** Stitch markers the gate counts. At least two hits are required. */
const STITCH_MARKER_SOURCE = '\\b(?:sc|dc|hdc|inc|dec|mr|sl\\s*st|rnd|row)\\b';

const SPAM_OR_SHORTLINK =
  /\b(?:telegram|crypto|bitcoin|ethereum|tether|usdt|nft|airdrop|binance|viagra|cialis|casino|lottery|forex)\b|t\.me\/|tg:\/\/|(?:^|[^a-z0-9.])(?:https?:\/\/)?(?:www\.)?(?:bit\.ly|tinyurl\.com|tiny\.cc|t\.co|goo\.gl|is\.gd|cutt\.ly|ow\.ly|rb\.gy|rebrand\.ly|shorturl\.at|buff\.ly|adf\.ly)(?:\/|$|\s)/i;

export type PreFilterResult = { ok: true } | { ok: false; reason: 'length' | 'spam' | 'markers' };

/**
 * Local gate that runs before a Gemini request. Length, spam, and stitch
 * density are decided on device so junk never spends model quota.
 */
export function preFilterSubmission(rawText: string): PreFilterResult {
  const text = rawText.trim();
  if (text.length < MIN_SUBMISSION_CHARS || text.length > MAX_SUBMISSION_CHARS) {
    return { ok: false, reason: 'length' };
  }
  if (SPAM_OR_SHORTLINK.test(text)) return { ok: false, reason: 'spam' };
  const markers = text.match(new RegExp(STITCH_MARKER_SOURCE, 'gi'));
  if (!markers || markers.length < 2) return { ok: false, reason: 'markers' };
  return { ok: true };
}

export function reviewCrochetPattern(input: { title: string; steps: readonly string[] }): CrochetReview {
  const title = input.title.trim();
  const steps = input.steps.map((step) => step.trim()).filter((step) => step.length > 0);
  if (!title) return { ok: false, reason: 'missing title' };
  if (steps.length === 0) return { ok: false, reason: 'missing steps' };

  const blob = `${title}\n${steps.join('\n')}`;
  if (isKnittingFeedTitle(title) && !CROCHET_WORD.test(blob)) {
    return { ok: false, reason: 'knitting pattern' };
  }

  const saysCrochet = CROCHET_WORD.test(blob);
  const instructional = steps.some((step) => !GENERIC_STEP.test(step));
  const stitchedRow = steps.some((step) => ROW_STEP.test(step) && STRONG_STITCH.test(step));
  if (saysCrochet && instructional) return { ok: true };
  if (stitchedRow && (saysCrochet || CROCHET_WORD.test(title) || looksLikeCrochetProject(title))) {
    return { ok: true };
  }
  return { ok: false, reason: 'not a crochet pattern' };
}

function looksLikeCrochetProject(title: string): boolean {
  return /\b(?:bag|blanket|hat|scarf|beanie|coaster|cardigan|shawl|granny|plush|amigurumi|mitten|sweater|pillow)\b/i.test(
    title,
  );
}
