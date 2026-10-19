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
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.round(value);
  }
  return null;
}

export function planningSizeForPattern(pattern: ScrapRankInput): { id: ScrapSizeClass; ceiling: number } | null {
  const haystack = `${pattern.title} ${pattern.tags.join(' ')} ${pattern.summary ?? ''}`.toLowerCase();
  for (const size of SIZE_CLASSES) {
    if (size.hints.some((hint) => mentions(haystack, pattern.tags, hint))) return size;
  }
  return null;
}

export function visionFitReason(patternWeight: YarnWeight, confirmedWeight: YarnWeight, sizeClass: ScrapSizeClass): string {
  const label = yarnWeightMeta(patternWeight).label;
  const weight =
    weightDistance(patternWeight, confirmedWeight) === 0
      ? `${label} matches the yarn you confirmed.`
      : `${label} is close to the yarn you confirmed.`;
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
  const cards: ScrapCatalogCard[] = [];
  for (const pattern of patterns) {
    const size = planningSizeForPattern(pattern);
    if (!size) continue;
    const tutorialYards = pattern.tutorialYards ?? null;
    if (available != null && available > 0) {
      if (size.ceiling > available) continue;
      if (tutorialYards != null && tutorialYards > available) continue;
    }
    cards.push({
      id: pattern.id,
      sizeClass: size.id,
      planningCeiling: size.ceiling,
      tutorialYards,
      yardageNote: yardageNoteFor({ planningCeiling: size.ceiling, tutorialYards }),
      score: scorePattern(pattern, size.ceiling, options.yarnWeight),
    });
  }
  cards.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return cards.slice(0, Math.max(0, limit));
}

function scorePattern(pattern: ScrapRankInput, ceiling: number, yarnWeight?: YarnWeight): number {
  let score = ceiling;
  if (yarnWeight) {
    const distance = weightDistance(pattern.yarnWeight, yarnWeight);
    if (distance === 0) score += 80;
    else if (distance === 1) score += 20;
  }
  return score;
}

function weightDistance(a: YarnWeight, b: YarnWeight): number {
  const left = WEIGHT_ORDER.indexOf(a);
  const right = WEIGHT_ORDER.indexOf(b);
  if (left < 0 || right < 0) return 9;
  return Math.abs(left - right);
}

function mentions(haystack: string, tags: readonly string[], hint: string): boolean {
  const needle = hint.toLowerCase();
  if (tags.some((tag) => tag.toLowerCase().includes(needle))) return true;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`, 'i').test(haystack);
}
