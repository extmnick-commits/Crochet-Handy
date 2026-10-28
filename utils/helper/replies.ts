/** Fast local answers and calculator routing, before any native AI/model work. */
import type { CrochetPattern, YarnStashItem, YarnWeight } from '../../store/machine';
import { scrapCatalogSuggestions } from '../scrapCatalogSource';
import { calculateCrochet, CALCULATOR_FIELDS, CALCULATOR_NAMES, type Calculation } from './calculators';
import { searchHelperPatterns, type HelperAction, type HelperContext } from './context';

export type HelperReply = {
  text: string;
  patterns?: CrochetPattern[];
  failed?: boolean;
  calculator?: Calculation;
  /** The checked formula already ran, so the chat can show an adjust button. */
  calculated?: boolean;
  actions?: HelperAction[];
};
const CAPABILITIES = 'I can explain crochet terms and pattern lines, help troubleshoot mistakes, find patterns with previews, and calculate yarn amounts, skeins, gauge, stitch increases/decreases, conversions, and time estimates. Open a pattern and tap Ask Helper, paste an instruction, or tap Calculators. What are you working on?';
const units: Record<string, string> = { yd: 'yd', yard: 'yd', yards: 'yd', m: 'm', meter: 'm', meters: 'm', metre: 'm', metres: 'm', in: 'in', inch: 'in', inches: 'in', cm: 'cm', centimeter: 'cm', centimeters: 'cm', centimetre: 'cm', centimetres: 'cm', g: 'g', gram: 'g', grams: 'g', oz: 'oz', ounce: 'oz', ounces: 'oz' };
const WEIGHTS: readonly YarnWeight[] = ['lace', 'fingering', 'sport', 'dk', 'worsted', 'aran', 'bulky', 'super-bulky', 'jumbo'];
/** Typical labeled yards for one full skein when the stash does not store a yardage. */
const SKEIN_YARDS: Record<YarnWeight, number> = {
  lace: 800, fingering: 400, sport: 300, dk: 250, worsted: 220, aran: 196, bulky: 120, 'super-bulky': 90, jumbo: 40,
};
type StitchFact = { name: string; made: number };
const US_STITCHES: Record<string, StitchFact> = {
  sc: { name: 'single crochet', made: 1 },
  dc: { name: 'double crochet', made: 1 },
  hdc: { name: 'half double crochet', made: 1 },
  tr: { name: 'treble crochet', made: 1 },
  dtr: { name: 'double treble crochet', made: 1 },
  htr: { name: 'half treble crochet', made: 1 },
  'sl st': { name: 'slip stitch', made: 1 },
  ch: { name: 'chain', made: 1 },
  inc: { name: 'increase (2 stitches in one stitch)', made: 2 },
  dec: { name: 'decrease', made: 1 },
};
const UK_STITCHES: Record<string, StitchFact> = {
  ...US_STITCHES,
  dc: { name: 'double crochet (UK; same as US single crochet)', made: 1 },
  htr: { name: 'half treble crochet (UK; same as US half double crochet)', made: 1 },
  tr: { name: 'treble crochet (UK; same as US double crochet)', made: 1 },
  dtr: { name: 'double treble crochet (UK; same as US treble crochet)', made: 1 },
};

export function quickHelperReply(
  question: string,
  context: HelperContext,
  catalog: readonly CrochetPattern[],
  yarns: readonly YarnStashItem[] = [],
): HelperReply | null {
  const q = question.toLowerCase().trim().replace(/[?!.,]+$/, '');
  // These fundamentals are easy for a small model to confuse. Keep answers
  // narrowly scoped so a more complex pattern question is not silently replaced.
  if (/\b(?:single crochet|\bsc\b)\b/.test(q) && !/\b(?:decrease|increase|together|blo|back loop|front loop|foundation|comparison|compare)\b/.test(q)) {
    if (/\b(?:how many loops|loops? (?:are|remain|on))\b/.test(q)) {
      return { text: 'For a standard US single crochet, after you insert the hook, yarn over and pull up a loop, there are two loops on the hook. Yarn over and pull through both. US single crochet is called double crochet in UK terms.' };
    }
    if (/^(?:please )?(?:how (?:do|can) i|how to|teach me to|show me how to|explain how to) (?:make|do|work|crochet) (?:a |an )?(?:single crochet(?: stitch)?|sc)$/.test(q)) {
      return { text: 'US single crochet: insert your hook into the next stitch, yarn over and pull up a loop (two loops on the hook). Yarn over again and pull through both loops. This stitch is called double crochet in UK terms.' };
    }
  }
  if (/^(hi|hello|hey|thanks|thank you)$/.test(q)) return { text: /thank/.test(q) ? 'You’re welcome! What would you like to work on next?' : 'Hi! I’m Crochet Handy Helper. Paste a crochet instruction, ask about a technique, find a pattern, or open Calculators.' };
  if (/^(?:what can you (?:do|help(?: me)? with)|what do you do|how can you help(?: me)?|help|what are your (?:features|capabilities))$/.test(q)) return { text: CAPABILITIES };
  if (/^(?:explain|help me (?:with|understand)) (?:this|the|my) pattern$/.test(q)) {
    return context.pattern
      ? { text: `I’m looking at “${context.pattern.title}”. Paste the exact row, round, or abbreviation you want explained, and tell me whether the pattern uses US or UK terms. Saved app details may not contain the full original instructions.`, patterns: [context.pattern] }
      : { text: 'Open a pattern and tap Ask Helper so I know which one you mean, or paste the row or round here. Tell me whether it uses US or UK terms.' };
  }
  if (/^explain row \d+$/.test(q)) {
    const row = context.project?.currentRow;
    const note = context.project?.rowNote?.trim();
    return {
      text: row == null
        ? 'Open the active project, or paste the row line you want explained.'
        : note
          ? `Row ${row} note: ${note}. Paste the pattern line if you want the abbreviations translated and the stitch count checked.`
          : `You’re on row ${row} of ${context.project?.totalRows}. Paste the pattern line for that row and I’ll translate it.`,
    };
  }
  if (/^estimate time left$/.test(q)) return estimateTime(context);
  if (/^pin a note to this row$/.test(q)) return { text: 'Type the note you want on this row, or paste a pattern line and I’ll offer Save to Row Note.' };
  if (/^evenly space increases$/.test(q)) return { text: `Let’s use ${CALCULATOR_NAMES.shaping} for a checked result. Enter ${CALCULATOR_FIELDS.shaping.map((f) => f.label.toLowerCase()).join(', ')} below.`, calculator: 'shaping' };
  if (/^decode a crochet row$/.test(q)) return { text: 'Paste a row or round, for example: Rnd 4: *2 sc, inc* rep around (18). Say if the pattern uses UK terms.' };
  if (/^convert us\s*↔\s*uk terms$/.test(q) || /^convert us\s*(?:<->|↔)\s*uk terms$/.test(q)) {
    return { text: 'US sc = UK dc. US hdc = UK htr. US dc = UK tr. US tr = UK dtr. Paste a row and say UK terms if you want that line translated.' };
  }
  if (/^calculate stitches or skeins$/.test(q)) return { text: 'Choose Skeins needed or Gauge & repeats below and enter the fields for a checked result.', calculator: 'skeins' };
  if (/^(?:help me (?:fix|with) (?:a |my )?mistake|my stitch count is wrong)$/.test(q)) return { text: 'What happened: too many stitches, too few, a wavy edge, or a hole? Paste the current row instruction and your stitch count. Check the first and last stitch and whether the turning chain counts as a stitch.' };
  if (/^(?:what (?:does|is)|explain) (?:a |an )?(sc|dc|hdc|tr|sl st|ch|inc|dec)(?: mean| stand for)?$/.test(q)) {
    const term = q.match(/\b(sc|dc|hdc|tr|sl st|ch|inc|dec)\b/)![0];
    const meanings: Record<string, string> = { sc: 'In US terms, sc means single crochet; its UK equivalent is double crochet.', dc: 'dc means double crochet in US terms and a different stitch, equivalent to US single crochet, in UK terms.', hdc: 'In US terms, hdc means half double crochet; the UK equivalent is half treble crochet.', tr: 'tr means treble crochet in US terms and a different stitch, equivalent to US double crochet, in UK terms.', 'sl st': 'sl st means slip stitch: insert the hook, yarn over, and pull through the stitch and the loop on the hook.', ch: 'ch means chain: yarn over and pull through the loop on the hook.', inc: 'inc means increase. The exact stitch and number worked into one stitch depend on the pattern.', dec: 'dec means decrease. The exact stitch and number joined together depend on the pattern.' };
    return { text: `${meanings[term]} Follow your pattern’s abbreviation key.` };
  }
  const decoded = decodePatternLine(question);
  if (decoded) return decoded;
  const stash = matchStash(q, context, yarns, catalog);
  if (stash) return stash;
  const shaped = naturalShaping(q);
  if (shaped) return shaped;
  const yarnLeft = naturalYarnLeft(q);
  if (yarnLeft) return yarnLeft;
  const suggested = suggestFromCatalog(question, catalog);
  if (suggested) return suggested;
  // Require the complete, unambiguous conversion sentence; never infer units/numbers from other text.
  const conversion = q.match(/^(?:please )?(?:convert )?(\d+(?:\.\d+)?)\s*(yd|yards?|m|met(?:er|re)s?|in|inch(?:es)?|cm|centimet(?:er|re)s?|g|grams?|oz|ounces?)\s+(?:to|in|into)\s+(yd|yards?|m|met(?:er|re)s?|in|inch(?:es)?|cm|centimet(?:er|re)s?|g|grams?|oz|ounces?)$/);
  if (conversion) {
    const result = calculateCrochet({ operation: 'convert', values: [Number(conversion[1])], units: [units[conversion[2]], units[conversion[3]]] });
    return { text: result.text, failed: !result.ok, calculator: 'convert', calculated: true };
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

const PROJECT_TYPES = /\b(?:hats?|beanies?|toques?|scar(?:f|ves)|blankets?|afghans?|bags?|totes?|purses?|coasters?|amigurumi|plush(?:ies)?|dolls?|flowers?|cardigans?|sweaters?|shawls?|dishcloths?|washcloths?|headbands?|ear warmers?|keychains?|bookmarks?|toys?|mushrooms?)\b/;

function asksForCatalogSuggestions(q: string): boolean {
  if (/\b(?:fix|mistake|wrong|curl|curling|hole|wavy|too (?:many|few))\b/.test(q)) return false;
  if (/\b(?:suggest(?:ion|ions)?|recommend(?:ation|ations)?|ideas?|find|search|show me|looking for|what (?:can|should) i (?:make|crochet)|something to (?:make|crochet)|next project)\b/.test(q)) return true;
  if (/\bpatterns?\b/.test(q) && !/\b(?:this|the|my) pattern\b/.test(q)) return true;
  return PROJECT_TYPES.test(q) && /\b(?:want|need|make|pattern|project|idea|suggest|find|show)\b/.test(q);
}

function suggestFromCatalog(question: string, catalog: readonly CrochetPattern[]): HelperReply | null {
  if (!asksForCatalogSuggestions(question.toLowerCase())) return null;
  let patterns = searchHelperPatterns(question, catalog, 3);
  const generic = /^(?:what (?:can|should) i (?:make|crochet)|(?:find|show|suggest|recommend)(?: me)? (?:some )?(?:(?:beginner|easy) )?(?:patterns?|ideas?|projects?))\s*[?.!]*$/i.test(question.trim());
  if (!patterns.length && generic) {
    patterns = [...catalog]
      .sort((a, b) => Number(b.difficulty === 'beginner') - Number(a.difficulty === 'beginner') || a.title.localeCompare(b.title))
      .slice(0, 3);
  }
  if (!patterns.length) return { text: catalog.length ? 'I couldn’t find a matching pattern in the current catalog. Try another keyword or browse Patterns.' : 'The catalog is empty right now. Refresh the Patterns tab, then ask again.' };
  return { text: 'Here are matching patterns from the local catalog. Open a card to preview it, and check the tutorial’s materials and gauge before starting.', patterns };
}

function ran(operation: Calculation, values: number[], units: string[], actions?: HelperAction[]): HelperReply {
  const result = calculateCrochet({ operation, values, units });
  return {
    text: result.text,
    failed: !result.ok,
    calculator: operation,
    calculated: true,
    actions: result.ok ? actions : undefined,
  };
}

function naturalShaping(q: string): HelperReply | null {
  const match = q.match(/\b(increase|decrease|increasing|decreasing)\b[\s\S]{0,40}?\bfrom\s+(\d+)\s+to\s+(\d+)\b/);
  if (!match) return null;
  const start = Number(match[2]);
  const target = Number(match[3]);
  const result = calculateCrochet({ operation: 'shaping', values: [start, target], units: [] });
  const actions: HelperAction[] = [];
  if (result.ok) {
    actions.push({ kind: 'row-note', text: result.text.split('\n')[0] ?? result.text });
    if (Number.isInteger(target) && target > 0) actions.push({ kind: 'stitch-target', stitches: target });
  }
  return { text: result.text, failed: !result.ok, calculator: 'shaping', calculated: true, actions: actions.length ? actions : undefined };
}

function naturalYarnLeft(q: string): HelperReply | null {
  const match = q.match(/(\d+(?:\.\d+)?)\s*g(?:rams?)?\b[\s\S]{0,40}?(\d+(?:\.\d+)?)\s*g(?:rams?)?\b[\s\S]{0,24}?(\d+(?:\.\d+)?)\s*(?:yd|yards?)\b/);
  if (!match) return null;
  const values = [Number(match[1]), Number(match[2]), Number(match[3])];
  const result = calculateCrochet({ operation: 'yarn', values, units: ['yd'] });
  return {
    text: result.text,
    failed: !result.ok,
    calculator: 'yarn',
    calculated: true,
    actions: result.ok ? [{ kind: 'row-note', text: result.text.split('\n')[0] ?? result.text }] : undefined,
  };
}

function estimateTime(context: HelperContext): HelperReply {
  const project = context.project;
  if (!project) return { text: 'Open an active project with the timer running, then ask again.', calculator: 'time' };
  const elapsedSeconds = project.accumulatedSeconds + (project.timerStartedAt == null ? 0 : Math.max(0, (Date.now() - project.timerStartedAt) / 1000));
  const minutes = elapsedSeconds / 60;
  const completed = Math.max(0, project.currentRow - 1);
  if (!(minutes > 0) || completed < 1) {
    return { text: 'I need some elapsed time and at least one completed row. Start the project timer, finish a row, then ask again.', calculator: 'time' };
  }
  return ran('time', [minutes, completed, project.totalRows], []);
}

function decodePatternLine(question: string): HelperReply | null {
  const line = question.split('\n').map((part) => part.trim()).map((part) => {
    const indexed = part.match(/(?:row|rnd|round)\s+\d+\b[\s\S]*$/i)?.[0];
    if (indexed && /\b(?:sc|dc|hdc|htr|tr|dtr|inc|dec|sl st|ch)\b/i.test(indexed)) return indexed;
    if (/\*[^*]{1,80}\*/.test(part) && /\b(?:sc|dc|hdc|htr|tr|dtr|inc|dec|sl st|ch)\b/i.test(part)) return part;
    return '';
  }).find(Boolean);
  if (!line) return null;
  const dialect: 'US' | 'UK' = /\buk\b/i.test(question) && !/\bus terms\b/i.test(question) ? 'UK' : 'US';
  const glossary = dialect === 'UK' ? UK_STITCHES : US_STITCHES;
  const header = line.match(/^(row|rnd|round)\s+(\d+)\s*[:.]?\s*/i);
  const label = header ? `${/^row$/i.test(header[1]) ? 'Row' : 'Round'} ${header[2]}` : 'This line';
  const body = line.slice(header?.[0].length ?? 0);
  const claimed = body.match(/\((\d+)\s*(?:sts?|stitches)?\)/i);
  const claimedCount = claimed ? Number(claimed[1]) : null;
  const starred = body.match(/\*([^*]+)\*/);
  const source = starred?.[1] ?? body.replace(/\([^)]*\)/g, ' ');
  const parsed = parseStitchGroup(source, glossary);
  if (!parsed) return null;
  const times = body.replace(starred?.[0] ?? '', ' ').match(/\b(?:rep(?:eat)?|x|×)\s*(\d+)\b/i);
  const repeatCount = times ? Number(times[1]) : null;
  let math = '';
  let mathOk = false;
  let target: number | null = null;
  if (repeatCount != null) {
    const produced = parsed.made * repeatCount;
    target = claimedCount ?? produced;
    mathOk = claimedCount == null || claimedCount === produced;
    math = mathOk
      ? ` ${repeatCount} repeats make ${produced} stitches${claimedCount != null ? ', which matches the count in parentheses' : ''}.`
      : ` ${repeatCount} repeats make ${produced} stitches, but the line says ${claimedCount}. Those counts do not match.`;
  } else if (starred && claimedCount != null) {
    mathOk = claimedCount % parsed.made === 0 && parsed.made > 0;
    target = mathOk ? claimedCount : null;
    const repeats = mathOk ? claimedCount / parsed.made : null;
    math = mathOk
      ? ` That is ${repeats} repeats and ${claimedCount} stitches, which matches the count in parentheses.`
      : ` Each repeat makes ${parsed.made} stitches. The line says ${claimedCount}, which is not a multiple of ${parsed.made}, so this repeat does not land on that count.`;
  } else if (claimedCount != null) {
    mathOk = claimedCount === parsed.made;
    target = mathOk ? claimedCount : null;
    math = mathOk
      ? ` That makes ${parsed.made} stitches, which matches the count in parentheses.`
      : ` That makes ${parsed.made} stitches, but the line says ${claimedCount}. Those counts do not match.`;
  } else {
    math = ` Each group makes ${parsed.made} stitches. Add the ending count in parentheses if you want it checked.`;
  }
  const text = `${label}, ${dialect} terms: ${parsed.parts.join(', ')}.${math}`;
  const actions: HelperAction[] = [{ kind: 'row-note', text }];
  if (mathOk && target != null && target > 0 && target <= 100_000) actions.push({ kind: 'stitch-target', stitches: target });
  return { text, actions };
}

function parseStitchGroup(source: string, glossary: Record<string, StitchFact>): { parts: string[]; made: number } | null {
  const chunks = source.split(/,|(?=\d+\s*(?:sl st|sc|hdc|htr|dtr|dc|tr|ch|inc|dec)\b)/i)
    .map((part) => part.trim())
    .filter((part) => /\b(?:sl st|sc|hdc|htr|dtr|dc|tr|ch|inc|dec)\b/i.test(part));
  if (chunks.length === 0) return null;
  let made = 0;
  const parts: string[] = [];
  for (const chunk of chunks) {
    const match = chunk.match(/(\d+)?\s*(sl st|sc|hdc|htr|dtr|dc|tr|ch|inc|dec)\b/i);
    if (!match) return null;
    const count = match[1] ? Number(match[1]) : 1;
    const fact = glossary[match[2].toLowerCase()];
    if (!fact || !Number.isInteger(count) || count < 1 || count > 500) return null;
    made += fact.made * count;
    parts.push(count > 1 ? `${count} ${fact.name}` : fact.name);
  }
  return made > 0 ? { parts, made } : null;
}

function matchStash(q: string, context: HelperContext, yarns: readonly YarnStashItem[], catalog: readonly CrochetPattern[]): HelperReply | null {
  const asking = /\b(?:what can i make with my stash|match patterns to my yarn stash|do i have (?:stash )?yarn|yarn for this|stash yarn)\b/.test(q);
  if (!asking) return null;
  if (yarns.length === 0) return { text: 'Your yarn stash is empty. Add skeins on the Me tab, then ask again.' };
  const groups = stashGroups(yarns);
  if (context.pattern && /\b(?:this|pattern)\b/.test(q)) {
    const weight = context.pattern.yarnWeight;
    const close = groups.filter((group) => Math.abs(WEIGHTS.indexOf(group.weight) - WEIGHTS.indexOf(weight)) <= 1);
    const yards = close.reduce((sum, group) => sum + group.yards, 0);
    if (close.length === 0) {
      return { text: `Your stash has no recorded ${weight} or neighboring yarn weight for “${context.pattern.title}”. Check the tutorial's materials and gauge before substituting.`, patterns: [context.pattern] };
    }
    const suggestions = scrapCatalogSuggestions({ yarnWeight: weight, availableYards: yards || undefined, limit: 3, patterns: catalog });
    const summary = `about ${yards} yd of ${close.map((group) => group.weight).join(' and ')} (estimated from skein counts)`;
    const fit = suggestions.some((item) => item.pattern.id === context.pattern?.id);
    const text = fit
      ? `“${context.pattern.title}” fits ${summary}. These catalog cards are in that range. Check the tutorial materials before you start.`
      : `You have ${summary}. “${context.pattern.title}” is ${weight}. These smaller catalog matches stay within the estimate. Confirm yardage in the original tutorial.`;
    return { text, patterns: suggestions.map((item) => item.pattern) };
  }
  const cards = groups.flatMap((group) => scrapCatalogSuggestions({ yarnWeight: group.weight, availableYards: group.yards, limit: 3, patterns: catalog }));
  const seen = new Set<string>();
  const patterns = cards.flatMap((card) => {
    if (seen.has(card.pattern.id)) return [];
    seen.add(card.pattern.id);
    return [card.pattern];
  }).slice(0, 3);
  const summary = groups.map((group) => `${group.skeins} ${group.weight} skein${group.skeins === 1 ? '' : 's'} (about ${group.yards} yd)`).join(', ');
  if (patterns.length === 0) return { text: `I estimated ${summary}, but no catalog project fits that weight and yardage. Try a smaller make or add more skeins.` };
  return { text: `From your stash I estimated ${summary}. These catalog patterns fit that weight and yardage. Check each tutorial’s materials before starting.`, patterns };
}

function stashGroups(yarns: readonly YarnStashItem[]): { weight: YarnWeight; skeins: number; yards: number }[] {
  const totals = new Map<YarnWeight, number>();
  for (const yarn of yarns) {
    if (!WEIGHTS.includes(yarn.yarnWeight) || yarn.skeinCount <= 0) continue;
    totals.set(yarn.yarnWeight, (totals.get(yarn.yarnWeight) ?? 0) + yarn.skeinCount);
  }
  return [...totals.entries()].map(([weight, skeins]) => ({ weight, skeins, yards: skeins * SKEIN_YARDS[weight] }));
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
