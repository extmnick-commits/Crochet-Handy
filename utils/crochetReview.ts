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
