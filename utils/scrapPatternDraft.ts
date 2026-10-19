/**
 * Draft patterns the app can check.
 * A reply that fails the stitch-count check is not shown as instructions.
 */
import type { PatternDifficulty, YarnWeight } from '@/store/machine';
import { yarnWeightMeta } from '@/utils/patternDisplay';
import { hookMmInRange, hookRangeLabel } from '@/utils/scrapHookRange';

export const DRAFT_SHAPES = ['sc-rectangle', 'dc-rectangle', 'sc-circle', 'granny-square', 'unsupported'] as const;
export type DraftShape = (typeof DRAFT_SHAPES)[number];

export type DraftAbbreviation = {
  abbr: string;
  meaning: string;
};

export type DraftInstruction = {
  n: number;
  text: string;
  stitchCount: number;
};

export type PatternDraftRequest = {
  make: string;
  size: string;
  skill: PatternDifficulty;
  yarnCategory: YarnWeight;
  yards: number | null;
};

export type CheckedPatternDraft = {
  kind: 'draft';
  title: string;
  shape: Exclude<DraftShape, 'unsupported'>;
  shapeLabel: string;
  skill: PatternDifficulty;
  materials: string;
  hook: string;
  gaugeNote: string;
  abbreviations: DraftAbbreviation[];
  instructions: DraftInstruction[];
  banner: string;
};

export type PatternDraftCheck =
  | CheckedPatternDraft
  | { kind: 'unsupported'; message: string }
  | { kind: 'rejected'; reasons: string[] };

export const PATTERN_DRAFT_BANNER =
  'Draft pattern. Not tested. Work a gauge swatch before you rely on these counts.';

export const UNSUPPORTED_SHAPE_MESSAGE =
  'This step only drafts a checked rectangle, flat circle, or granny square. A sweater, garment, or shaped toy is not generated here.';

export const PATTERN_DRAFT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    shape: { type: 'string', enum: [...DRAFT_SHAPES] },
    title: { type: 'string' },
    stitchesAcross: { type: 'integer' },
    rows: { type: 'integer' },
    rounds: { type: 'integer' },
    hookMm: { type: 'number' },
    gaugeNote: { type: 'string' },
    abbreviations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          abbr: { type: 'string' },
          meaning: { type: 'string' },
        },
        required: ['abbr', 'meaning'],
      },
    },
    materials: { type: 'string' },
    instructions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          n: { type: 'integer' },
          text: { type: 'string' },
          stitchCount: { type: 'integer' },
        },
        required: ['n', 'text', 'stitchCount'],
      },
    },
  },
  required: ['shape', 'title', 'hookMm', 'gaugeNote', 'abbreviations', 'materials', 'instructions'],
} as const;

export function patternDraftPrompt(request: PatternDraftRequest): string {
  const meta = yarnWeightMeta(request.yarnCategory);
  const yards =
    request.yards == null
      ? 'The available amount is only a rough category. Do not claim it is enough.'
      : `The maker entered ${request.yards} yards. If your rough estimate is higher, the materials line must say the leftovers may not be enough.`;
  return [
    `Draft a simple crochet pattern for: ${request.make || 'a small piece'}.`,
    `Approximate size: ${request.size || 'small'}. Skill: ${request.skill}.`,
    `Yarn category: ${meta.label}. Suggested hook must be inside ${hookRangeLabel(request.yarnCategory)}.`,
    yards,
    'Choose only sc-rectangle, dc-rectangle, sc-circle, or granny-square.',
    'Use unsupported for a sweater, garment, or shaped toy.',
    'Single crochet rectangle: chain stitchesAcross + 1, then that many sc in every row.',
    'Double crochet rectangle: chain stitchesAcross + 2, then that many dc in every row. The turning chain does not count.',
    'Single crochet circle: round 1 has 6 sc, and each round adds 6 sc.',
    'Granny square: round n has 12 times n double crochets.',
    'The last instruction fastens off and keeps that round or row count.',
    'Gauge text must say it is an assumption.',
    'This draft is not tested.',
  ].join(' ');
}

export function checkPatternDraft(text: string, request: PatternDraftRequest): PatternDraftCheck {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { kind: 'rejected', reasons: ['The draft was not valid JSON.'] };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { kind: 'rejected', reasons: ['The draft was not a pattern object.'] };
  }
  const record = parsed as Record<string, unknown>;
  const shape = record.shape;
  if (shape === 'unsupported') return { kind: 'unsupported', message: UNSUPPORTED_SHAPE_MESSAGE };
  if (shape !== 'sc-rectangle' && shape !== 'dc-rectangle' && shape !== 'sc-circle' && shape !== 'granny-square') {
    return { kind: 'rejected', reasons: ['The draft used a shape this checker does not know.'] };
  }
  const expected = expectedCounts(shape, record);
  if (!expected.ok) return { kind: 'rejected', reasons: expected.reasons };
  const reasons: string[] = [];
  const hookMm = typeof record.hookMm === 'number' ? record.hookMm : Number.NaN;
  if (!hookMmInRange(request.yarnCategory, hookMm)) {
    reasons.push(`The hook must stay inside ${hookRangeLabel(request.yarnCategory)}.`);
  }
  const gaugeNote = typeof record.gaugeNote === 'string' ? record.gaugeNote.trim() : '';
  if (!/assum/i.test(gaugeNote)) reasons.push('The gauge must be labeled as an assumption.');
  const abbreviations = readAbbreviations(record.abbreviations);
  const needed = shape === 'dc-rectangle' || shape === 'granny-square' ? 'dc' : 'sc';
  if (!abbreviations.some((item) => item.abbr.toLowerCase() === 'ch')) reasons.push('Abbreviations must define ch.');
  if (!abbreviations.some((item) => item.abbr.toLowerCase() === needed)) {
    reasons.push(`Abbreviations must define ${needed}.`);
  }
  const materials = typeof record.materials === 'string' ? record.materials.trim() : '';
  const yarnLabel = yarnWeightMeta(request.yarnCategory).label;
  if (!materials.toLowerCase().includes(yarnLabel.toLowerCase())) {
    reasons.push(`Materials must name the confirmed yarn, ${yarnLabel}.`);
  }
  const estimate = estimateYards(shape, expected.counts);
  if (request.yards == null) {
    if (/\b(enough|guaranteed|will fit)\b/i.test(materials)) {
      reasons.push('Materials must not claim the leftovers are enough when the amount is only a rough category.');
    }
  } else if (estimate > request.yards) {
    if (!/may not be enough/i.test(materials)) {
      reasons.push('Materials must say the leftovers may not be enough when the draft estimate is higher.');
    }
  }
  const instructions = readInstructions(record.instructions);
  if (!instructions) {
    reasons.push('Each instruction needs a number, text, and a stitch count.');
  } else {
    if (instructions.length !== expected.counts.length) {
      reasons.push('The number of instructions does not match the checked construction.');
    }
    instructions.forEach((instruction, index) => {
      const count = expected.counts[index];
      if (instruction.n !== index + 1) reasons.push(`Instruction ${index + 1} is numbered ${instruction.n}.`);
      if (count != null && instruction.stitchCount !== count) {
        reasons.push(`Instruction ${index + 1} counts ${instruction.stitchCount} stitches. The check expects ${count}.`);
      }
    });
    const last = instructions[instructions.length - 1];
    if (!last || !/fasten off/i.test(last.text)) reasons.push('The draft must end by fastening off.');
    const first = instructions[0];
    if (first && expected.foundation != null && !foundationMatches(first.text, expected.foundation)) {
      reasons.push(`The foundation chain must start with ${expected.foundation} chains.`);
    }
  }
  if (reasons.length > 0 || !instructions) return { kind: 'rejected', reasons };
  const title = typeof record.title === 'string' && record.title.trim() ? record.title.trim().slice(0, 80) : shapeLabel(shape);
  return {
    kind: 'draft',
    title,
    shape,
    shapeLabel: shapeLabel(shape),
    skill: request.skill,
    materials,
    hook: `${hookMm.toFixed(1)} mm`,
    gaugeNote,
    abbreviations,
    instructions,
    banner: PATTERN_DRAFT_BANNER,
  };
}

function expectedCounts(
  shape: Exclude<DraftShape, 'unsupported'>,
  record: Record<string, unknown>,
): { ok: true; counts: number[]; foundation: number | null } | { ok: false; reasons: string[] } {
  if (shape === 'sc-rectangle' || shape === 'dc-rectangle') {
    const stitches = readInt(record.stitchesAcross);
    const rows = readInt(record.rows);
    if (stitches == null || stitches < 4 || stitches > 40) return { ok: false, reasons: ['Stitches across must be from 4 to 40.'] };
    if (rows == null || rows < 2 || rows > 30) return { ok: false, reasons: ['Rows must be from 2 to 30.'] };
    return {
      ok: true,
      counts: Array.from({ length: rows }, () => stitches),
      foundation: shape === 'sc-rectangle' ? stitches + 1 : stitches + 2,
    };
  }
  const rounds = readInt(record.rounds);
  if (shape === 'sc-circle') {
    if (rounds == null || rounds < 1 || rounds > 12) return { ok: false, reasons: ['Circle rounds must be from 1 to 12.'] };
    return { ok: true, counts: Array.from({ length: rounds }, (_, index) => 6 * (index + 1)), foundation: null };
  }
  if (rounds == null || rounds < 1 || rounds > 8) return { ok: false, reasons: ['Granny rounds must be from 1 to 8.'] };
  return { ok: true, counts: Array.from({ length: rounds }, (_, index) => 12 * (index + 1)), foundation: null };
}

function estimateYards(shape: Exclude<DraftShape, 'unsupported'>, counts: readonly number[]): number {
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (shape === 'granny-square') return Math.max(1, Math.ceil(counts.length * 8));
  if (shape === 'sc-circle') return Math.max(1, Math.ceil(counts.length * counts.length));
  return Math.max(1, Math.ceil(total / 8));
}

function readAbbreviations(value: unknown): DraftAbbreviation[] {
  if (!Array.isArray(value)) return [];
  const abbreviations: DraftAbbreviation[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.abbr !== 'string' || typeof record.meaning !== 'string') continue;
    const abbr = record.abbr.trim();
    const meaning = record.meaning.trim();
    if (!abbr || !meaning) continue;
    abbreviations.push({ abbr, meaning });
  }
  return abbreviations;
}

function readInstructions(value: unknown): DraftInstruction[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const instructions: DraftInstruction[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') return null;
    const record = entry as Record<string, unknown>;
    const n = readInt(record.n);
    const stitchCount = readInt(record.stitchCount);
    if (n == null || stitchCount == null || typeof record.text !== 'string' || !record.text.trim()) return null;
    instructions.push({ n, text: record.text.trim(), stitchCount });
  }
  return instructions;
}

function foundationMatches(text: string, chains: number): boolean {
  const match = text.match(/chain\s+(\d+)/i);
  return match != null && Number(match[1]) === chains;
}

function readInt(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  return value;
}

function shapeLabel(shape: Exclude<DraftShape, 'unsupported'>): string {
  if (shape === 'sc-rectangle') return 'Single crochet rectangle';
  if (shape === 'dc-rectangle') return 'Double crochet rectangle';
  if (shape === 'sc-circle') return 'Flat single crochet circle';
  return 'Granny square';
}
