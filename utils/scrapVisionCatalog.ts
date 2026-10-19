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
import { searchAmount, type QuantityCategory, type VisionSubject } from '@/utils/scrapVisionOutput';

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
  return catalogResults(input);
}

/** Missing estimates widen the suggestions instead of blocking the results screen. */
export function recommendScannedCatalog(
  input: ConfirmedYarnSearch & { subjects: readonly VisionSubject[] },
): ConfirmedCatalogResult {
  const showsYarn = input.subjects.some((subject) => subject === 'loose-yarn' || subject === 'fabric' || subject === 'label');
  if (!showsYarn && (input.subjects.includes('none') || !input.subjects.includes('uncertain'))) {
    return { status: 'results', cards: [], amountNote: 'No yarn was identified. Try a clearer photo, or edit the yarn details.' };
  }
  return catalogResults(input);
}

function catalogResults(input: ConfirmedYarnSearch): ConfirmedCatalogResult {
  const amount = searchAmount(input);
  const weight = input.yarnCategory === 'uncertain' ? undefined : input.yarnCategory;
  const ranked = scrapCatalogSuggestions({
    yarnWeight: weight,
    availableYards: amount?.yards,
    // Filter before taking six: the highest-ranked rows may all be a larger size.
    limit: Number.MAX_SAFE_INTEGER,
  });
  const cards: VisionCatalogCard[] = [];
  for (const item of ranked) {
    if (weight && weightDistance(item.pattern.yarnWeight, weight) > 1) continue;
    const size = planningSizeForPattern({
      id: item.pattern.id,
      title: item.pattern.title,
      tags: item.pattern.tags,
      summary: item.pattern.summary,
      yarnWeight: item.pattern.yarnWeight,
    });
    if (!size) continue;
    if (!amount && size.id === 'medium') continue;
    const seed = SEED_PATTERNS.find((entry) => entry.id === item.pattern.id);
    cards.push({
      ...item,
      sizeClass: size.id,
      reason: weight
        ? visionFitReason(item.pattern.yarnWeight, weight, size.id).replace('the yarn you confirmed', 'your selected or estimated yarn')
        : 'A small-project idea. Check the tutorial’s yarn weight and hook before starting.',
      materialsNote: tutorialMaterialsNote(seed ? seed.materials : null),
    });
    if (cards.length === 6) break;
  }
  const amountNote = [
    !weight ? 'Yarn thickness is uncertain, so these ideas cover different yarn weights.' : '',
    !amount
      ? 'Amount is unknown. Showing small-project ideas; check the yarn needed in each tutorial.'
      : amount.kind === 'entered-yards'
      ? 'Searching with the yards you entered. A match is not a guarantee that the leftovers are enough.'
      : 'Using a rough amount estimate. Check that you have enough yarn for the tutorial.',
  ].filter(Boolean).join(' ');
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
