/** Fast local answers and calculator routing, before any native AI/model work. */
import type { CrochetPattern } from '../../store/machine';
import { calculateCrochet, CALCULATOR_FIELDS, CALCULATOR_NAMES, type Calculation } from './calculators';
import { searchHelperPatterns, type HelperContext } from './context';

export type HelperReply = { text: string; patterns?: CrochetPattern[]; failed?: boolean; calculator?: Calculation };
const CAPABILITIES = 'I can explain crochet terms and pattern lines, help troubleshoot mistakes, find patterns with previews, and calculate yarn amounts, skeins, gauge, stitch increases/decreases, conversions, and time estimates. Open a pattern and tap Ask Helper, paste an instruction, or tap Calculators. What are you working on?';
const units: Record<string, string> = { yd: 'yd', yard: 'yd', yards: 'yd', m: 'm', meter: 'm', meters: 'm', metre: 'm', metres: 'm', in: 'in', inch: 'in', inches: 'in', cm: 'cm', centimeter: 'cm', centimeters: 'cm', centimetre: 'cm', centimetres: 'cm', g: 'g', gram: 'g', grams: 'g', oz: 'oz', ounce: 'oz', ounces: 'oz' };

export function quickHelperReply(question: string, context: HelperContext, catalog: readonly CrochetPattern[]): HelperReply | null {
  const q = question.toLowerCase().trim().replace(/[?!.,]+$/, '');
  if (/^(hi|hello|hey|thanks|thank you)$/.test(q)) return { text: /thank/.test(q) ? 'You’re welcome! What would you like to work on next?' : 'Hi! I’m Crochet Handy Helper. Paste a crochet instruction, ask about a technique, find a pattern, or open Calculators.' };
  if (/^(?:what can you (?:do|help(?: me)? with)|what do you do|how can you help(?: me)?|help|what are your (?:features|capabilities))$/.test(q)) return { text: CAPABILITIES };
  if (/^(?:explain|help me (?:with|understand)) (?:this|the|my) pattern$/.test(q)) {
    return context.pattern
      ? { text: `I’m looking at “${context.pattern.title}”. Paste the exact row, round, or abbreviation you want explained, and tell me whether the pattern uses US or UK terms. Saved app details may not contain the full original instructions.`, patterns: [context.pattern] }
      : { text: 'Open a pattern and tap Ask Helper so I know which one you mean, or paste the row or round here. Tell me whether it uses US or UK terms.' };
  }
  if (/^(?:help me (?:fix|with) (?:a |my )?mistake|my stitch count is wrong)$/.test(q)) return { text: 'What happened: too many stitches, too few, a wavy edge, or a hole? Paste the current row instruction and your stitch count. Check the first and last stitch and whether the turning chain counts as a stitch.' };
  if (/^(?:what (?:does|is)|explain) (?:a |an )?(sc|dc|hdc|tr|sl st|ch|inc|dec)(?: mean| stand for)?$/.test(q)) {
    const term = q.match(/\b(sc|dc|hdc|tr|sl st|ch|inc|dec)\b/)![0];
    const meanings: Record<string, string> = { sc: 'In US terms, sc means single crochet; its UK equivalent is double crochet.', dc: 'dc means double crochet in US terms and a different stitch, equivalent to US single crochet, in UK terms.', hdc: 'In US terms, hdc means half double crochet; the UK equivalent is half treble crochet.', tr: 'tr means treble crochet in US terms and a different stitch, equivalent to US double crochet, in UK terms.', 'sl st': 'sl st means slip stitch: insert the hook, yarn over, and pull through the stitch and the loop on the hook.', ch: 'ch means chain: yarn over and pull through the loop on the hook.', inc: 'inc means increase. The exact stitch and number worked into one stitch depend on the pattern.', dec: 'dec means decrease. The exact stitch and number joined together depend on the pattern.' };
    return { text: `${meanings[term]} Follow your pattern’s abbreviation key.` };
  }
  if (/\b(find|recommend|search|show me)\b/.test(q) && /\b(patterns?|projects?|tutorials?|coaster|bag|blanket|amigurumi)\b/.test(q)) {
    const patterns = searchHelperPatterns(question, catalog);
    return patterns.length ? { text: 'Here are matching patterns from the local catalog. Check each tutorial’s materials and gauge before starting.', patterns }
      : { text: 'No close catalog match yet. Try a project type such as coaster, bag, or amigurumi, plus your yarn weight or skill level.' };
  }
  // Require the complete, unambiguous conversion sentence; never infer units/numbers from other text.
  const conversion = q.match(/^(?:please )?(?:convert )?(\d+(?:\.\d+)?)\s*(yd|yards?|m|met(?:er|re)s?|in|inch(?:es)?|cm|centimet(?:er|re)s?|g|grams?|oz|ounces?)\s+(?:to|in|into)\s+(yd|yards?|m|met(?:er|re)s?|in|inch(?:es)?|cm|centimet(?:er|re)s?|g|grams?|oz|ounces?)$/);
  if (conversion) {
    const result = calculateCrochet({ operation: 'convert', values: [Number(conversion[1])], units: [units[conversion[2]], units[conversion[3]]] });
    return { text: result.text, failed: !result.ok, calculator: 'convert' };
  }
  let calculator: Calculation | null = null;
  if (/\b(skeins?|balls?)\b/.test(q) && /\b(how many|need|calculate)\b/.test(q)) calculator = 'skeins';
  else if (/\b(yarn|yards?|meters?|metres?|grams?)\b/.test(q) && /\b(enough|remaining|left|calculate|how much)\b/.test(q)) calculator = 'yarn';
  else if (/\b(convert|conversion)\b/.test(q)) calculator = 'convert';
  else if (/\b(increase|decrease|shaping)\b/.test(q) && /\d|calculate|how many/.test(q)) calculator = 'shaping';
  else if (/\b(percent|percentage)\b|%/.test(q)) calculator = 'percent';
  else if (/\b(how long|time estimate|time remaining|calculate time)\b/.test(q)) calculator = 'time';
  else if (/\b(rows?|height)\b/.test(q) && /\b(gauge|calculate|how many)\b/.test(q)) calculator = 'rows';
  else if (/\b(gauge|stitches)\b/.test(q) && /\b(calculate|how many|width)\b/.test(q)) calculator = 'gauge';
  if (calculator) return { text: `Let’s use ${CALCULATOR_NAMES[calculator]} for a checked result. Enter ${CALCULATOR_FIELDS[calculator].map((f) => f.label.toLowerCase()).join(', ')} below.`, calculator };
  if (context.pattern && /^(?:what|which) (?:hook|hook size|yarn weight)(?: (?:do i need|does this (?:use|need)|for this pattern))?$/.test(q)) {
    const p = context.pattern;
    return { text: `The saved details for “${p.title}” list ${/hook/.test(q) ? `hook: ${p.hookSize || 'not recorded'}` : `yarn weight: ${p.yarnWeight || 'not recorded'}`}. Confirm this in the original tutorial and check your gauge.`, patterns: [p] };
  }
  return null;
}

/** Plain text only. Filter template artifacts and stop the exact hashtag/phrase loop in the report. */
export function cleanHelperAnswer(text: string, final = false): string {
  let answer = text.replace(/<\|[^>]*\|>/g, '').replace(/^\s*assistant\s*[:\n]?/i, '').replace(/<think>[\s\S]*?(?:<\/think>|$)/g, '').trimStart();
  answer = answer.replace(/^```(?:json|text)?\s*/i, '').replace(/```\s*$/, '');
  if (answer.startsWith('{')) {
    // Recover useful prose even if a model echoes the old JSON format and hits its token limit.
    // This is text recovery only: no model-provided operation or action is executed.
    const value = answer.match(/"answer"\s*:\s*"((?:\\.|[^"\\])*)/s)?.[1];
    if (value === undefined) return '';
    try { answer = JSON.parse(`"${value.replace(/\\$/, '')}"`) as string; } catch { return ''; }
  }
  answer = answer.split(/\s+#[a-z][a-z0-9_]*/i)[0].replace(/https?:\/\/\S+/g, '[Open the original pattern]').slice(0, 1200);
  const repeat = answer.match(/(.{12,90}?)\1\1/i);
  if (repeat?.index !== undefined) answer = answer.slice(0, repeat.index + repeat[1].length);
  if (final) {
    const end = [...answer.matchAll(/[.!?](?=\s|$)/g)].pop()?.index;
    if (end !== undefined && end > 35 && end < answer.trimEnd().length - 1) answer = answer.slice(0, end + 1);
  }
  return answer.trimEnd();
}
