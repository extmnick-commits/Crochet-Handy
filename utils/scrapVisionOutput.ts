/**
 * Accept or reject a vision-model reply.
 * Grams, exact yards, and a recommended hook size from the model are dropped.
 */
import { YARN_WEIGHTS, type YarnWeight } from '@/store/machine';
import { yarnWeightMeta } from '@/utils/patternDisplay';
import { parseKnownYards } from '@/utils/yarnAmount';

export const VISION_SUBJECTS = ['loose-yarn', 'fabric', 'hook', 'label', 'none', 'uncertain'] as const;
export type VisionSubject = (typeof VISION_SUBJECTS)[number];

export const QUANTITY_CATEGORIES = ['under-25', '25-75', '75-150', 'skein-or-more', 'uncertain'] as const;
export type QuantityCategory = (typeof QUANTITY_CATEGORIES)[number];

export const STITCH_CONFIDENCE = ['low', 'medium', 'high'] as const;
export type StitchConfidence = (typeof STITCH_CONFIDENCE)[number];

export type VisionStitch = {
  name: string;
  confidence: StitchConfidence;
  alternatives: string[];
};

export type YarnVisionFindings = {
  subjects: VisionSubject[];
  yarnCategory: YarnWeight | 'uncertain';
  categorySource: 'label' | 'visual' | 'uncertain';
  labelText: string | null;
  hookObservedMarking: string | null;
  stitches: VisionStitch[] | 'uncertain';
  quantityCategory: QuantityCategory;
};

const STITCH_ALIASES: Record<string, string> = {
  ch: 'chain',
  chain: 'chain',
  'slip stitch': 'slip stitch',
  'slip-stitch': 'slip stitch',
  slst: 'slip stitch',
  'sl st': 'slip stitch',
  sc: 'single crochet',
  'single crochet': 'single crochet',
  hdc: 'half double crochet',
  'half double': 'half double crochet',
  'half double crochet': 'half double crochet',
  dc: 'double crochet',
  'double crochet': 'double crochet',
  tr: 'treble crochet',
  treble: 'treble crochet',
  'treble crochet': 'treble crochet',
  shell: 'shell stitch',
  'shell stitch': 'shell stitch',
  granny: 'granny stitch',
  'granny stitch': 'granny stitch',
  puff: 'puff stitch',
  'puff stitch': 'puff stitch',
  bobble: 'bobble stitch',
  'bobble stitch': 'bobble stitch',
  popcorn: 'popcorn stitch',
  'popcorn stitch': 'popcorn stitch',
  cluster: 'cluster stitch',
  'cluster stitch': 'cluster stitch',
  fpdc: 'front post double crochet',
  'front post double crochet': 'front post double crochet',
  bpdc: 'back post double crochet',
  'back post double crochet': 'back post double crochet',
  moss: 'moss stitch',
  'moss stitch': 'moss stitch',
  linen: 'linen stitch',
  'linen stitch': 'linen stitch',
  waffle: 'waffle stitch',
  'waffle stitch': 'waffle stitch',
  ripple: 'ripple stitch',
  'ripple stitch': 'ripple stitch',
};

export const VISION_FINDINGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    subjects: {
      type: 'array',
      items: { type: 'string', enum: [...VISION_SUBJECTS] },
    },
    yarnCategory: { type: 'string', enum: [...YARN_WEIGHTS, 'uncertain'] },
    categorySource: { type: 'string', enum: ['label', 'visual', 'uncertain'] },
    labelText: { type: ['string', 'null'] },
    hookObservedMarking: { type: ['string', 'null'] },
    stitches: {
      anyOf: [
        { type: 'string', enum: ['uncertain'] },
        {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              name: { type: 'string' },
              confidence: { type: 'string', enum: [...STITCH_CONFIDENCE] },
              alternatives: { type: 'array', items: { type: 'string' } },
            },
            required: ['name', 'confidence', 'alternatives'],
          },
        },
      ],
    },
    quantityCategory: { type: 'string', enum: [...QUANTITY_CATEGORIES] },
  },
  required: ['subjects', 'yarnCategory', 'categorySource', 'labelText', 'hookObservedMarking', 'stitches', 'quantityCategory'],
} as const;

export const VISION_SYSTEM_PROMPT = [
  'You inspect one crochet photo on the device.',
  'Reply with JSON only.',
  'Say uncertain when the photo does not show the answer.',
  'A photo cannot measure grams or yards. Do not report either.',
  'If a yarn label is readable, copy that text and prefer it over a visual guess.',
  'If a hook shows a readable size marking, copy only that marking.',
  'Name stitches only when crocheted fabric is clear.',
].join(' ');

export const VISION_USER_PROMPT = [
  'What is in this photo? Identify loose yarn, crocheted fabric, a hook, or a readable yarn label. Estimate a yarn category only when the photo supports it.',
  'Reply with one JSON object and no other text.',
  '{"subjects":["loose-yarn"],"yarnCategory":"uncertain","categorySource":"uncertain","labelText":null,"hookObservedMarking":null,"stitches":"uncertain","quantityCategory":"uncertain"}',
].join(' ');

export function visionPromptMentionsColor(): boolean {
  return /color/i.test(`${VISION_SYSTEM_PROMPT}\n${VISION_USER_PROMPT}`);
}

export function parseVisionFindings(text: string): YarnVisionFindings | null {
  const parsed = extractJsonObject(text);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const findings = findingsFromRecord(parsed as Record<string, unknown>);
    if (findings) return findings;
  }
  return findingsFromProse(text);
}

function findingsFromRecord(record: Record<string, unknown>): YarnVisionFindings | null {
  const subjects = readSubjects(record.subjects) ?? subjectsFromText(Object.values(record).join(' '));
  if (!subjects) return null;
  const labelText = readOptionalText(record.labelText);
  const labeled = weightFromLabel(labelText);
  const visual = readCategory(record.yarnCategory);
  const yarnCategory = labeled ?? visual ?? 'uncertain';
  const categorySource: YarnVisionFindings['categorySource'] = labeled
    ? 'label'
    : yarnCategory === 'uncertain'
      ? 'uncertain'
      : readCategorySource(record.categorySource, yarnCategory);
  const seesHook = subjects.includes('hook');
  const hookObservedMarking = seesHook ? readHookMarking(record.hookObservedMarking) : null;
  const stitches = subjects.includes('fabric') ? readStitches(record.stitches) : 'uncertain';
  const quantityCategory = readQuantity(record.quantityCategory);
  return {
    subjects,
    yarnCategory,
    categorySource,
    labelText,
    hookObservedMarking,
    stitches,
    quantityCategory,
  };
}

function findingsFromProse(text: string): YarnVisionFindings | null {
  const subjects = subjectsFromText(text);
  if (!subjects) return null;
  const yarnCategory = weightFromLabel(text) ?? 'uncertain';
  return {
    subjects,
    yarnCategory,
    categorySource: yarnCategory === 'uncertain' ? 'uncertain' : 'visual',
    labelText: null,
    hookObservedMarking: subjects.includes('hook') ? readHookMarking(text) : null,
    stitches: 'uncertain',
    quantityCategory: 'uncertain',
  };
}

function extractJsonObject(text: string): unknown | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced?.[1] ?? text;
  const start = source.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(source.slice(start, index + 1)) as unknown;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export function weightFromLabel(text: string | null): YarnWeight | null {
  if (!text) return null;
  const haystack = text.toLowerCase();
  let best: { weight: YarnWeight; length: number } | null = null;
  for (const candidate of labelCandidates()) {
    if (!candidate.pattern.test(haystack)) continue;
    if (!best || candidate.length > best.length) best = { weight: candidate.weight, length: candidate.length };
  }
  return best?.weight ?? null;
}

const CATEGORY_YARDS: Record<Exclude<QuantityCategory, 'uncertain'>, number | undefined> = {
  'under-25': 25,
  '25-75': 75,
  '75-150': 150,
  // Skeins have no standard length. Do not invent a 400-yard total.
  'skein-or-more': undefined,
};

/** Entered yards win. Rough ceilings scope ideas, never certify enough yarn. */
export function searchAmount(input: { quantityCategory: QuantityCategory; yardsText: string }): {
  yards: number | undefined;
  kind: 'entered-yards' | 'rough-category';
} | null {
  const yards = parseKnownYards(input.yardsText);
  if (yards != null) return { yards, kind: 'entered-yards' };
  // Invalid explicit measurements must not silently fall back to a larger range.
  if (input.yardsText.trim()) return null;
  if (input.quantityCategory === 'uncertain') return null;
  return { yards: CATEGORY_YARDS[input.quantityCategory], kind: 'rough-category' };
}

export function emptyVisionFindings(): YarnVisionFindings {
  return {
    subjects: ['uncertain'],
    yarnCategory: 'uncertain',
    categorySource: 'uncertain',
    labelText: null,
    hookObservedMarking: null,
    stitches: 'uncertain',
    quantityCategory: 'uncertain',
  };
}

const SUBJECT_ALIASES: Record<string, VisionSubject> = {
  'loose-yarn': 'loose-yarn',
  'loose yarn': 'loose-yarn',
  yarn: 'loose-yarn',
  skein: 'loose-yarn',
  skeins: 'loose-yarn',
  ball: 'loose-yarn',
  balls: 'loose-yarn',
  fabric: 'fabric',
  crochet: 'fabric',
  crocheted: 'fabric',
  'crocheted fabric': 'fabric',
  hook: 'hook',
  'crochet hook': 'hook',
  label: 'label',
  'yarn label': 'label',
  none: 'none',
  uncertain: 'uncertain',
  unknown: 'uncertain',
};

function readSubjects(value: unknown): VisionSubject[] | null {
  const entries = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/,|\/|\band\b/) : [];
  const subjects: VisionSubject[] = [];
  for (const entry of entries) {
    if (typeof entry !== 'string') continue;
    const subject = SUBJECT_ALIASES[entry.trim().toLowerCase()];
    if (subject && !subjects.includes(subject)) subjects.push(subject);
  }
  const named = subjects.filter((subject) => subject !== 'none' && subject !== 'uncertain');
  if (named.length > 0) return named;
  return subjects.length > 0 ? subjects : null;
}

function subjectsFromText(text: string): VisionSubject[] | null {
  const haystack = text.toLowerCase();
  const subjects: VisionSubject[] = [];
  if (/\b(loose yarn|skeins?|balls? of yarn|yarn balls?|balls? of wool)\b/.test(haystack)) subjects.push('loose-yarn');
  else if (/\byarn\b/.test(haystack)) subjects.push('loose-yarn');
  if (/\b(crocheted fabric|crochet fabric|finished fabric)\b/.test(haystack)) subjects.push('fabric');
  if (/\b(crochet hook|hook)\b/.test(haystack)) subjects.push('hook');
  if (/\b(yarn label|label)\b/.test(haystack)) subjects.push('label');
  return subjects.length > 0 ? subjects : null;
}

function readCategory(value: unknown): YarnWeight | 'uncertain' | null {
  if (value === 'uncertain' || value === 'unknown') return 'uncertain';
  if (typeof value !== 'string') return null;
  if ((YARN_WEIGHTS as readonly string[]).includes(value)) return value as YarnWeight;
  return weightFromLabel(value);
}

function readCategorySource(
  value: unknown,
  yarnCategory: YarnWeight | 'uncertain',
): YarnVisionFindings['categorySource'] {
  if (value === 'label' || value === 'visual' || value === 'uncertain') return value;
  return yarnCategory === 'uncertain' ? 'uncertain' : 'visual';
}

function readOptionalText(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 160) : null;
}

function readHookMarking(value: unknown): string | null {
  const text = readOptionalText(value);
  if (!text) return null;
  if (/\d+(?:\.\d+)?\s*mm/i.test(text)) return text.slice(0, 24);
  if (/^[a-np](?:-\d{1,2})?$/i.test(text)) return text.toUpperCase();
  return null;
}

function readStitches(value: unknown): VisionStitch[] | 'uncertain' {
  if (value === 'uncertain' || value == null) return 'uncertain';
  if (!Array.isArray(value)) return 'uncertain';
  const stitches: VisionStitch[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const name = normalizeStitch(record.name);
    const confidence = record.confidence;
    if (!name || (confidence !== 'low' && confidence !== 'medium' && confidence !== 'high')) continue;
    const alternatives = Array.isArray(record.alternatives)
      ? record.alternatives
          .map((item) => normalizeStitch(item))
          .filter((item): item is string => item != null && item !== name)
          .slice(0, 3)
      : [];
    stitches.push({ name, confidence, alternatives });
    if (stitches.length === 4) break;
  }
  return stitches.length > 0 ? stitches : 'uncertain';
}

function normalizeStitch(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const key = value.trim().toLowerCase().replace(/\s+/g, ' ');
  return STITCH_ALIASES[key] ?? null;
}

function readQuantity(value: unknown): QuantityCategory {
  if (typeof value !== 'string') return 'uncertain';
  return QUANTITY_CATEGORIES.includes(value as QuantityCategory) ? (value as QuantityCategory) : 'uncertain';
}

function labelCandidates(): { weight: YarnWeight; pattern: RegExp; length: number }[] {
  const phrases: { weight: YarnWeight; phrase: string }[] = [];
  for (const weight of YARN_WEIGHTS) {
    const meta = yarnWeightMeta(weight);
    phrases.push({ weight, phrase: meta.label });
    phrases.push({ weight, phrase: meta.sizeName });
    phrases.push({ weight, phrase: meta.number });
    phrases.push({ weight, phrase: weight });
  }
  phrases.push(
    { weight: 'sport', phrase: '4 ply' },
    { weight: 'dk', phrase: '8 ply' },
    { weight: 'dk', phrase: 'double knit' },
    { weight: 'dk', phrase: 'light worsted' },
    { weight: 'aran', phrase: '10 ply' },
    { weight: 'bulky', phrase: 'chunky' },
    { weight: 'super-bulky', phrase: 'super chunky' },
    { weight: 'fingering', phrase: 'sock' },
  );
  return phrases
    .map((entry) => ({
      weight: entry.weight,
      length: entry.phrase.length,
      pattern: new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(entry.phrase.toLowerCase())}(?:[^a-z0-9]|$)`, 'i'),
    }))
    .sort((a, b) => b.length - a.length);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
