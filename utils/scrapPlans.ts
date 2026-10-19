/**
 * App-owned leftover projects.
 * Yardage and hook size come from this file. The model is not allowed to invent them.
 */
import type { PatternDifficulty, YarnWeight } from '@/store/machine';

export const YARDAGE_TIERS = [
  { id: 'scrap_under_25yd', label: 'Micro Scrap <25 yds', yards: 25 },
  { id: 'small_25_75yd', label: 'Mini Ball 25–75 yds', yards: 75 },
  { id: 'half_skein_75_150yd', label: 'Half Skein 75–150 yds', yards: 150 },
] as const;

export type YardageTier = (typeof YARDAGE_TIERS)[number]['id'];

export type ScrapLayout = 'stripe' | 'block' | 'detail';

export type ScrapPlan = {
  id: string;
  projectType: string;
  estimatedYards: number;
  difficulty: PatternDifficulty;
  layout: ScrapLayout;
  title: (colors: readonly ScrapColorRef[]) => string;
};

export type ScrapColorRef = {
  name: string;
  hex: string;
};

export type ScrapProjectIdea = {
  planId: string;
  title: string;
  estimatedYardage: string;
  estimatedYards: number;
  yardageKind: 'planning-estimate';
  colorPlacement: string;
  hookSize: string;
  difficulty: PatternDifficulty;
  layout: ScrapLayout;
};

const HOOK_FOR_WEIGHT: Record<YarnWeight, string> = {
  lace: '1.75 mm',
  fingering: '2.75 mm',
  sport: '3.5 mm',
  dk: '4.0 mm',
  worsted: '5.0 mm',
  aran: '5.5 mm',
  bulky: '6.5 mm',
  'super-bulky': '9.0 mm',
  jumbo: '12.0 mm',
};

const MAX_IDEAS = 3;

export const SCRAP_PLANS: readonly ScrapPlan[] = [
  {
    id: 'charm-keychain',
    projectType: 'keychain',
    estimatedYards: 12,
    difficulty: 'beginner',
    layout: 'detail',
    title: (colors) => `${primaryName(colors)} keychain charm`,
  },
  {
    id: 'hair-scrunchie',
    projectType: 'scrunchie',
    estimatedYards: 20,
    difficulty: 'beginner',
    layout: 'stripe',
    title: (colors) => `${colorPhrase(colors)} hair scrunchie`,
  },
  {
    id: 'mug-coaster',
    projectType: 'coaster',
    estimatedYards: 24,
    difficulty: 'easy',
    layout: 'block',
    title: (colors) => `${primaryName(colors)} mug coaster`,
  },
  {
    id: 'scrunchie-set',
    projectType: 'scrunchie',
    estimatedYards: 36,
    difficulty: 'beginner',
    layout: 'block',
    title: (colors) => `${colorPhrase(colors)} scrunchie set`,
  },
  {
    id: 'amigurumi-keychain',
    projectType: 'keychain',
    estimatedYards: 45,
    difficulty: 'easy',
    layout: 'detail',
    title: (colors) => `${primaryName(colors)} amigurumi keychain`,
  },
  {
    id: 'coaster-pair',
    projectType: 'coaster',
    estimatedYards: 55,
    difficulty: 'easy',
    layout: 'stripe',
    title: (colors) => `${colorPhrase(colors)} striped coaster pair`,
  },
  {
    id: 'striped-dishcloth',
    projectType: 'dishcloth',
    estimatedYards: 80,
    difficulty: 'beginner',
    layout: 'stripe',
    title: (colors) => `${colorPhrase(colors)} striped dishcloth`,
  },
  {
    id: 'color-block-headband',
    projectType: 'headband',
    estimatedYards: 95,
    difficulty: 'easy',
    layout: 'block',
    title: (colors) => `${colorPhrase(colors)} color-block headband`,
  },
  {
    id: 'mini-amigurumi',
    projectType: 'amigurumi',
    estimatedYards: 120,
    difficulty: 'intermediate',
    layout: 'detail',
    title: (colors) => `${primaryName(colors)} mini amigurumi`,
  },
];

export function hookForYarnWeight(weight: YarnWeight): string {
  return HOOK_FOR_WEIGHT[weight];
}

export function parseAvailableYards(text: string): number {
  const match = text.replace(/,/g, '').match(/\d+/);
  if (!match) return 0;
  const value = Number.parseInt(match[0], 10);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(value, 10000);
}

export function tierForYards(yards: number): YardageTier {
  if (yards <= 25) return 'scrap_under_25yd';
  if (yards <= 75) return 'small_25_75yd';
  return 'half_skein_75_150yd';
}

export function isYardageTier(value: string): value is YardageTier {
  return YARDAGE_TIERS.some((tier) => tier.id === value);
}

export function rankScrapPlans(availableYards: number): ScrapPlan[] {
  if (!Number.isFinite(availableYards) || availableYards <= 0) return [];
  const fitting = SCRAP_PLANS.filter((plan) => plan.estimatedYards <= availableYards);
  const ranked = [...fitting].sort(
    (a, b) => b.estimatedYards - a.estimatedYards || a.id.localeCompare(b.id),
  );
  const chosen: ScrapPlan[] = [];
  for (const plan of ranked) {
    if (chosen.length === MAX_IDEAS) break;
    if (chosen.some((item) => item.projectType === plan.projectType)) continue;
    chosen.push(plan);
  }
  for (const plan of ranked) {
    if (chosen.length === MAX_IDEAS) break;
    if (chosen.some((item) => item.id === plan.id)) continue;
    chosen.push(plan);
  }
  return chosen;
}

export function ideaFromPlan(
  plan: ScrapPlan,
  colors: readonly ScrapColorRef[],
  weight: YarnWeight,
  layout: ScrapLayout = plan.layout,
): ScrapProjectIdea {
  return {
    planId: plan.id,
    title: plan.title(colors),
    estimatedYards: plan.estimatedYards,
    estimatedYardage: `${plan.estimatedYards} yd planning estimate`,
    yardageKind: 'planning-estimate',
    colorPlacement: placementFor(layout, colors, weight),
    hookSize: hookForYarnWeight(weight),
    difficulty: plan.difficulty,
    layout,
  };
}

export function ideasFromPlans(
  plans: readonly ScrapPlan[],
  colors: readonly ScrapColorRef[],
  weight: YarnWeight,
): ScrapProjectIdea[] {
  return plans.map((plan) => ideaFromPlan(plan, colors, weight));
}

export function colorToken(color: ScrapColorRef): string {
  return `${color.name.trim()} (${color.hex.trim()})`;
}

function primaryName(colors: readonly ScrapColorRef[]): string {
  return colors[0]?.name.trim() || 'Leftover';
}

function colorPhrase(colors: readonly ScrapColorRef[]): string {
  const names = colors.map((color) => color.name.trim()).filter((name) => name.length > 0);
  if (names.length === 0) return 'Leftover';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

export function placementFor(
  layout: ScrapLayout,
  colors: readonly ScrapColorRef[],
  weight: YarnWeight,
): string {
  const labels = colors.map(colorToken);
  const primary = labels[0] ?? 'the main color';
  const second = labels[1] ?? primary;
  const third = labels[2] ?? second;
  const weightLabel = weight === 'super-bulky' ? 'super bulky' : weight;
  if (layout === 'stripe') {
    return colors.length > 1
      ? `Stripe ${primary} and ${second} every two rounds in ${weightLabel} weight so each leftover stays visible.`
      : `Work every round in ${primary} ${weightLabel} weight, with a ridge stitch that reads as a stripe.`;
  }
  if (layout === 'block') {
    const accent = colors.length > 2 ? `, then finish with ${third}` : '';
    return colors.length > 1
      ? `Color-block the body in ${primary} and the edge in ${second}${accent}. Keep the yarn ${weightLabel} weight.`
      : `Keep the body and the edge in ${primary} ${weightLabel} weight.`;
  }
  const accent = colors.length > 2 ? `, with ${third} as a tiny accent` : '';
  return colors.length > 1
    ? `Use ${primary} for the amigurumi body and ${second} for the shell stripes${accent}. Work it in ${weightLabel} weight.`
    : `Use ${primary} for the amigurumi body and the small details, in ${weightLabel} weight.`;
}
