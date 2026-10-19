/**
 * Constrained scrap choices.
 * The schema only offers plans and colors the app already accepts.
 * A second check rejects anything outside those limits.
 */
import type { YarnWeight } from '@/store/machine';
import {
  SCRAP_PLANS,
  colorToken,
  ideaFromPlan,
  type ScrapColorRef,
  type ScrapLayout,
  type ScrapPlan,
  type ScrapProjectIdea,
} from '@/utils/scrapPlans';

const LAYOUTS: readonly ScrapLayout[] = ['stripe', 'block', 'detail'];

export type ScrapChoice = {
  planId: string;
  layout: ScrapLayout;
  colors: string[];
};

export type ScrapChoiceValidation = {
  ideas: ScrapProjectIdea[] | null;
  violations: number;
};

export function scrapChoiceSchema(planIds: readonly string[], colorTokens: readonly string[]) {
  const choiceCount = Math.min(3, planIds.length);
  return {
    type: 'object',
    additionalProperties: false,
    required: ['choices'],
    properties: {
      choices: {
        type: 'array',
        minItems: choiceCount,
        maxItems: choiceCount,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['planId', 'layout', 'colors'],
          properties: {
            planId: { type: 'string', enum: [...planIds] },
            layout: { type: 'string', enum: [...LAYOUTS] },
            colors: {
              type: 'array',
              minItems: 1,
              maxItems: Math.max(1, Math.min(4, colorTokens.length)),
              items: { type: 'string', enum: [...colorTokens] },
            },
          },
        },
      },
    },
  };
}

export function scrapChoiceMessages(input: {
  plans: readonly ScrapPlan[];
  colors: readonly ScrapColorRef[];
  weight: YarnWeight;
  availableYards: number;
}): { role: string; content: string }[] {
  const plans = input.plans
    .map((plan) => `- ${plan.id}: ${plan.title(input.colors)} (${plan.estimatedYards} yd planning estimate, ${plan.projectType})`)
    .join('\n');
  const colors = input.colors.map(colorToken).join(', ');
  return [
    {
      role: 'system',
      content:
        'You choose crochet plans from the list the app gives you. Reply with JSON only. Do not invent projects, colors, yardage, or hook sizes.',
    },
    {
      role: 'user',
      content: [
        'The colors were confirmed by the user from a photo sampler. You cannot see the photo.',
        `Confirmed colors: ${colors}.`,
        `Yarn weight: ${input.weight}.`,
        `Total yards available: ${input.availableYards}.`,
        'Choose among these plans only. Every plan already fits the yard total.',
        plans,
        `Return ${Math.min(3, input.plans.length)} choices. Do not repeat a plan id.`,
        'Each choice lists a planId, a layout of stripe, block, or detail, and one or more of the confirmed color tokens.',
      ].join('\n'),
    },
  ];
}

export function validateScrapChoices(
  text: string,
  plans: readonly ScrapPlan[],
  colors: readonly ScrapColorRef[],
  weight: YarnWeight,
  availableYards: number,
): ScrapChoiceValidation {
  const payload = readPayload(text);
  if (!payload) return { ideas: null, violations: 1 };
  const choices = payload.choices;
  if (!Array.isArray(choices)) return { ideas: null, violations: 1 };
  const expected = Math.min(3, plans.length);
  let violations = 0;
  if (choices.length !== expected) violations += 1;
  const allowedPlans = new Map(plans.map((plan) => [plan.id, plan]));
  const allowedColors = new Map(colors.map((color) => [colorToken(color), color]));
  const seenPlans = new Set<string>();
  const ideas: ScrapProjectIdea[] = [];
  for (const choice of choices) {
    const read = readChoice(choice, allowedPlans, allowedColors, availableYards);
    violations += read.violations;
    if (!read.plan || !read.layout || !read.colors) continue;
    if (seenPlans.has(read.plan.id)) {
      violations += 1;
      continue;
    }
    seenPlans.add(read.plan.id);
    ideas.push(ideaFromPlan(read.plan, read.colors, weight, read.layout));
  }
  if (violations > 0 || ideas.length !== expected) {
    return { ideas: null, violations: Math.max(1, violations) };
  }
  return { ideas, violations: 0 };
}

function readPayload(text: string): { choices?: unknown } | null {
  const trimmed = text.trim();
  const direct = parseObject(trimmed);
  if (direct) return direct;
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  return parseObject(trimmed.slice(start, end + 1));
}

function parseObject(text: string): { choices?: unknown } | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as { choices?: unknown };
  } catch {
    return null;
  }
}

function readChoice(
  value: unknown,
  allowedPlans: Map<string, ScrapPlan>,
  allowedColors: Map<string, ScrapColorRef>,
  availableYards: number,
): { plan: ScrapPlan | null; layout: ScrapLayout | null; colors: ScrapColorRef[] | null; violations: number } {
  if (!value || typeof value !== 'object') {
    return { plan: null, layout: null, colors: null, violations: 1 };
  }
  const record = value as Record<string, unknown>;
  let violations = 0;
  if (record.planId == null || record.layout == null || record.colors == null) violations += 1;
  const plan = typeof record.planId === 'string' ? allowedPlans.get(record.planId) ?? null : null;
  if (!plan) violations += 1;
  else if (!SCRAP_PLANS.some((item) => item.id === plan.id) || plan.estimatedYards > availableYards) violations += 1;
  const layout = LAYOUTS.find((item) => item === record.layout) ?? null;
  if (!layout) violations += 1;
  const chosen = readColors(record.colors, allowedColors);
  violations += chosen.violations;
  if (hasInvalidQuantity(record, plan, availableYards)) violations += 1;
  if (!plan || !layout || !chosen.colors) {
    return { plan: null, layout: null, colors: null, violations: Math.max(1, violations) };
  }
  return { plan, layout, colors: chosen.colors, violations };
}

function readColors(
  value: unknown,
  allowedColors: Map<string, ScrapColorRef>,
): { colors: ScrapColorRef[] | null; violations: number } {
  if (!Array.isArray(value) || value.length === 0) return { colors: null, violations: 1 };
  const colors: ScrapColorRef[] = [];
  let violations = 0;
  for (const entry of value) {
    if (typeof entry !== 'string' || !allowedColors.has(entry)) {
      violations += 1;
      continue;
    }
    const color = allowedColors.get(entry);
    if (!color) continue;
    if (colors.some((item) => item.hex === color.hex)) {
      violations += 1;
      continue;
    }
    colors.push(color);
  }
  if (violations > 0 || colors.length === 0) return { colors: null, violations: Math.max(1, violations) };
  return { colors, violations: 0 };
}

function hasInvalidQuantity(record: Record<string, unknown>, plan: ScrapPlan | null, availableYards: number): boolean {
  if (!('quantity' in record) && !('estimatedYards' in record)) return false;
  const raw = record.quantity ?? record.estimatedYards;
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw <= 0) return true;
  if (raw > availableYards) return true;
  if (!plan || raw !== plan.estimatedYards) return true;
  return false;
}
