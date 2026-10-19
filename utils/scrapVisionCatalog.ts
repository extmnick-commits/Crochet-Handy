/**
 * Catalog matches for a confirmed yarn category and amount.
 * Planning ceilings are not tutorial requirements, and no row is invented.
 */
import type { YarnWeight } from '@/store/machine';
import { SEED_PATTERNS } from '@/store/seed';
import {
  planningSizeForPattern,
  tutorialMaterialsNote,
  visionFitReason,
  type ScrapSizeClass,
} from '@/utils/scrapCatalogRank';
import { scrapCatalogSuggestions, type ScrapCatalogSuggestion } from '@/utils/patternCatalog';
import { searchAmount, type QuantityCategory } from '@/utils/scrapVisionOutput';

export type VisionCatalogCard = ScrapCatalogSuggestion & {
  reason: string;
  materialsNote: string;
  sizeClass: ScrapSizeClass;
};

export type ConfirmedYarnSearch = {
  yarnCategory: YarnWeight | 'uncertain';
  quantityCategory: QuantityCategory;
  yardsText: string;
  gramsText: string;
};

export type ConfirmedCatalogResult =
  | { status: 'need-category' }
  | { status: 'need-amount' }
  | { status: 'results'; cards: VisionCatalogCard[]; amountNote: string };

export function recommendConfirmedCatalog(input: ConfirmedYarnSearch): ConfirmedCatalogResult {
  if (input.yarnCategory === 'uncertain') return { status: 'need-category' };
  const amount = searchAmount(input);
  if (!amount) return { status: 'need-amount' };
  const weight = input.yarnCategory;
  const ranked = scrapCatalogSuggestions({
    yarnWeight: weight,
    availableYards: amount.yards,
    limit: 12,
  });
  const cards: VisionCatalogCard[] = [];
  for (const item of ranked) {
    const distance = weightDistance(item.pattern.yarnWeight, weight);
    if (distance > 1) continue;
    const size = planningSizeForPattern({
      id: item.pattern.id,
      title: item.pattern.title,
      tags: item.pattern.tags,
      summary: item.pattern.summary,
      yarnWeight: item.pattern.yarnWeight,
    });
    if (!size) continue;
    const seed = SEED_PATTERNS.find((entry) => entry.id === item.pattern.id);
    cards.push({
      ...item,
      sizeClass: size.id,
      reason: visionFitReason(item.pattern.yarnWeight, weight, size.id),
      materialsNote: tutorialMaterialsNote(seed ? seed.materials : null),
    });
    if (cards.length === 6) break;
  }
  const amountNote =
    amount.kind === 'entered-yards'
      ? 'Searching with the yards you entered. A match is not a guarantee that the leftovers are enough.'
      : 'Searching with a rough amount, not a measured yardage. A match is not a guarantee that the leftovers are enough.';
  return { status: 'results', cards, amountNote };
}

function weightDistance(a: YarnWeight, b: YarnWeight): number {
  const order: readonly YarnWeight[] = [
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
  const left = order.indexOf(a);
  const right = order.indexOf(b);
  if (left < 0 || right < 0) return 9;
  return Math.abs(left - right);
}
