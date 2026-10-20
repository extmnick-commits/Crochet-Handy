/**
 * Rank bundled tutorials for leftover yarn.
 * A planning size is not a tutorial requirement. Numeric tutorial yards are used
 * only when the catalog row actually has one.
 */
import type { YarnWeight } from '@/store/machine';
import { yarnWeightMeta } from '@/utils/patternDisplay';

export type ScrapSizeClass = 'micro' | 'small' | 'medium';

export type ScrapRankInput = {
  id: string;
  title: string;
  tags: readonly string[];
  summary?: string;
  yarnWeight: YarnWeight;
  tutorialYards?: number | null;
};

export type ScrapCatalogCard = {
  id: string;
  sizeClass: ScrapSizeClass;
  planningCeiling: number;
  tutorialYards: number | null;
  yardageNote: string;
  score: number;
};

const SIZE_CLASSES: readonly { id: ScrapSizeClass; ceiling: number; hints: readonly string[] }[] = [
  { id: 'micro', ceiling: 25, hints: ['keychain', 'charm', 'bookmark', 'ornament', 'applique', 'appliqué'] },
  { id: 'small', ceiling: 75, hints: ['coaster', 'scrunchie', 'flower'] },
  { id: 'medium', ceiling: 150, hints: ['headband', 'ear warmer', 'dishcloth', 'washcloth', 'mini', 'amigurumi', 'plushie', 'plush', 'doll'] },
];

const WEIGHT_ORDER: readonly YarnWeight[] = [
  'lace',
  'fingering',
  'sport',
  'dk',
  'worsted',
  'aran',
  'bulky',
  'super-bulky',
  'jumbo',
];

const TUTORIAL_YARD_KEYS = ['tutorialYards', 'yarnYards', 'requiredYards'] as const;

export function readTutorialYards(record: object): number | null {
  const row = record as Record<string, unknown>;
  for (const key of TUTORIAL_YARD_KEYS) {
    const value = row[key];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.ceil(value);
  }
  return null;
}

export function planningSizeForPattern(pattern: ScrapRankInput): { id: ScrapSizeClass; ceiling: number } | null {
  // A flower motif in a cardigan or a charm mentioned in a description does
  // not make the tutorial a standalone scrap project. Prefer its actual title.
  const title = pattern.title.toLowerCase();
  if (/\b(blankets?|afghans?|cardigans?|sweaters?|shawls?|scarves|scarf|ponchos?|garments?|bedding)\b/.test(title)) return null;
  if (/\b(?:part|section|episode)\s*(?:[-:#]\s*)?(?:\d+|one|two|three)\b/i.test(title)) return null;
  if (/\b(roundup|round-up|compilation|pattern links|patterns you|ideas you)\b/.test(title)) return null;
  if (/\b(giant|oversized|life.size|large)\b/.test(title)) return null;
  for (const size of SIZE_CLASSES) {
    if (size.hints.some((hint) => mentions(title, hint))) return size;
  }
  return null;
}

export function visionFitReason(patternWeight: YarnWeight, confirmedWeight: YarnWeight, sizeClass: ScrapSizeClass): string {
  const label = yarnWeightMeta(patternWeight).label;
  const weight =
    weightDistance(patternWeight, confirmedWeight) === 0
      ? `${label} matches the yarn you confirmed.`
      : `${label} is close to the yarn you confirmed. Substituting yarn can change size and yardage; check the hook and gauge.`;
  const size =
    sizeClass === 'micro' ? 'Very small project.' : sizeClass === 'small' ? 'Small project.' : 'Medium project.';
  return `${weight} ${size}`;
}

export function tutorialMaterialsNote(
  materials: readonly { name: string; weight: string; yardage: string }[] | null,
): string {
  if (!materials || materials.length === 0) return 'This tutorial does not list materials.';
  const parts = materials.map((item) => {
    const yard = item.yardage.trim();
    const yardText = yard && yard !== '—' ? `, ${yard}` : '';
    return `${item.name} (${item.weight}${yardText})`;
  });
  return `Tutorial materials: ${parts.join('; ')}.`;
}

export function yardageNoteFor(card: { planningCeiling: number; tutorialYards: number | null }): string {
  if (card.tutorialYards != null) return `Tutorial requirement: ${card.tutorialYards} yd`;
  return `Planning estimate for this project type: up to ${card.planningCeiling} yd. This tutorial does not list yardage.`;
}

export function rankScrapCatalog(
  patterns: readonly ScrapRankInput[],
  options: { yarnWeight?: YarnWeight; availableYards?: number; limit?: number },
): ScrapCatalogCard[] {
  const limit = options.limit ?? 6;
  const available = options.availableYards;
  if (available != null && (!Number.isFinite(available) || available <= 0)) return [];
  const cards: ScrapCatalogCard[] = [];
  for (const pattern of patterns) {
    const size = planningSizeForPattern(pattern);
    if (!size) continue;
    // Filter before limiting, so unrelated weights cannot hide valid matches.
    if (options.yarnWeight && weightDistance(pattern.yarnWeight, options.yarnWeight) > 1) continue;
    const tutorialYards = readTutorialYards(pattern);
    // An explicit requirement takes precedence over a generic size estimate.
    if (available != null && (tutorialYards ?? size.ceiling) > available) continue;
    cards.push({
      id: pattern.id,
      sizeClass: size.id,
      planningCeiling: size.ceiling,
      tutorialYards,
      yardageNote: yardageNoteFor({ planningCeiling: size.ceiling, tutorialYards }),
      score: scorePattern(pattern, size.ceiling, tutorialYards, options.yarnWeight),
    });
  }
  cards.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return cards.slice(0, Math.max(0, limit));
}

function scorePattern(pattern: ScrapRankInput, ceiling: number, tutorialYards: number | null, yarnWeight?: YarnWeight): number {
  let score = ceiling;
  if (tutorialYards != null) score += 200;
  if (yarnWeight) {
    const distance = weightDistance(pattern.yarnWeight, yarnWeight);
    if (distance === 0) score += 1000;
  }
  return score;
}

function weightDistance(a: YarnWeight, b: YarnWeight): number {
  const left = WEIGHT_ORDER.indexOf(a);
  const right = WEIGHT_ORDER.indexOf(b);
  if (left < 0 || right < 0) return 9;
  return Math.abs(left - right);
}

function mentions(haystack: string, hint: string): boolean {
  const needle = hint.toLowerCase();
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:s|es)?(?:[^a-z0-9]|$)`, 'i').test(haystack);
}
