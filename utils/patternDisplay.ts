/**
 * Display helpers for the Patterns feed.
 *
 * Yarn "size" is the Craft Yarn Council number (#4 worsted, #3 DK, …).
 * Hook sizes are normalized to the compact badge form used on cards (`4.0mm`).
 */
import {
  MAX_COUNT,
  type CrochetPattern,
  type PatternComment,
  type PatternDifficulty,
  type YarnWeight,
} from '@/store/machine';
import { SEED_PATTERNS, seedCommunityReviewsForPattern, type SeedPatternMaterial, type SeedPatternTool } from '@/store/seed';
import {
  getActiveHolidayTopics,
  getHolidayTopic,
  holidayChipLabel,
  EVERGREEN_SCRAPE_CATEGORY_IDS,
  isEvergreenScrapeCategory,
  isHolidayTopicId,
  scrapeCategoryKeywords,
  type EvergreenScrapeCategoryId,
  type HolidayTopicId,
} from '@/utils/holidayTopics';
import { derivePatternSummary } from '@/utils/patternSummary';

export type CorePatternCategoryId =
  | 'following'
  | 'for-you'
  | 'trending'
  | EvergreenScrapeCategoryId;
export type PatternCategoryId = CorePatternCategoryId | HolidayTopicId;

const EVERGREEN_CHIP_LABELS: Record<EvergreenScrapeCategoryId, string> = {
  amigurumi: 'Amigurumi',
  wearables: 'Wearables',
  blankets: 'Blankets',
  'granny-squares': 'Granny Squares',
  beanies: 'Beanies',
  socks: 'Socks',
  coasters: 'Coasters',
  bags: 'Bags',
  'home-decor': 'Home',
};

export type PatternFeedCategory = { id: PatternCategoryId; label: string };

export type YarnWeightMeta = {
  id: YarnWeight;
  label: string;
  /** Craft Yarn Council size, shown on cards as `#4`. */
  number: string;
  /** Spoken size ("Medium") so search for "yarn size" matches either form. */
  sizeName: string;
};

const YARN_WEIGHT_META: Record<YarnWeight, YarnWeightMeta> = {
  lace: { id: 'lace', label: 'Lace', number: '#0', sizeName: 'Lace' },
  fingering: { id: 'fingering', label: 'Fingering', number: '#1', sizeName: 'Super fine' },
  sport: { id: 'sport', label: 'Sport', number: '#2', sizeName: 'Fine' },
  dk: { id: 'dk', label: 'DK', number: '#3', sizeName: 'Light' },
  worsted: { id: 'worsted', label: 'Worsted', number: '#4', sizeName: 'Medium' },
  aran: { id: 'aran', label: 'Aran', number: '#4', sizeName: 'Medium' },
  bulky: { id: 'bulky', label: 'Bulky', number: '#5', sizeName: 'Bulky' },
  'super-bulky': { id: 'super-bulky', label: 'Super bulky', number: '#6', sizeName: 'Super bulky' },
  jumbo: { id: 'jumbo', label: 'Jumbo', number: '#7', sizeName: 'Jumbo' },
};

const AVATAR_COLORS = ['#2F6B4F', '#6B4A2F', '#2F4A6B', '#6B2F4A', '#4A6B2F', '#6B5A2F', '#2F6B6B'] as const;

/** Image height / column width. Varied on purpose so the two columns read as masonry. */
export const MASONRY_IMAGE_RATIOS = [1.12, 1.38, 0.92, 1.22, 1.48, 0.98] as const;

/** Title + footer block height used when balancing masonry columns. */
export const MASONRY_TEXT_BLOCK = 86;

export function packMasonryColumns(
  patterns: CrochetPattern[],
  columnWidth: number,
  textBlock = MASONRY_TEXT_BLOCK,
  columnGap = 12,
): { pattern: CrochetPattern; imageHeight: number }[][] {
  const columns: { pattern: CrochetPattern; imageHeight: number }[][] = [[], []];
  const heights = [0, 0];

  patterns.forEach((pattern, index) => {
    const ratio = MASONRY_IMAGE_RATIOS[index % MASONRY_IMAGE_RATIOS.length] ?? 1;
    const imageHeight = Math.round(columnWidth * ratio);
    const column = heights[0] <= heights[1] ? 0 : 1;
    columns[column]?.push({ pattern, imageHeight });
    heights[column] += imageHeight + textBlock + columnGap;
  });

  return columns;
}

/** Patterns tab chips: core categories plus holiday chips only during each holiday window. */
export function patternFeedCategories(date = new Date()): readonly PatternFeedCategory[] {
  const seasonal = getActiveHolidayTopics(date).map((holiday) => ({
    id: holiday.id,
    label: holidayChipLabel(holiday.id),
  }));

  return [
    { id: 'following', label: 'Following' },
    { id: 'for-you', label: 'For You' },
    { id: 'trending', label: 'Trending' },
    ...seasonal,
    ...EVERGREEN_SCRAPE_CATEGORY_IDS.map((id) => ({ id, label: EVERGREEN_CHIP_LABELS[id] })),
  ];
}

export function yarnWeightMeta(weight: YarnWeight): YarnWeightMeta {
  return YARN_WEIGHT_META[weight];
}

export function yarnSizeLabel(weight: YarnWeight): string {
  const meta = yarnWeightMeta(weight);
  return `${meta.label} · ${meta.number}`;
}

/** `5.0 mm` and `5mm` both become `5.0mm`. Letter hooks are left as typed. */
export function formatHookSize(hook: string): string {
  const trimmed = hook.trim();
  if (!trimmed) return '—';
  const match = trimmed.match(/(\d+(?:\.\d+)?)\s*mm/i);
  const raw = match?.[1];
  if (!raw) return trimmed.replace(/\s+/g, '');
  const value = Number(raw);
  if (!Number.isFinite(value)) return trimmed.replace(/\s+/g, '');
  return `${value.toFixed(1)}mm`;
}

/** US letter sizes for the millimeter hooks people actually buy. `4` mm is a G-6. */
export const HOOK_SIZE_OPTIONS = [
  { millimeters: 2.25, letter: 'B-1' },
  { millimeters: 2.75, letter: 'C-2' },
  { millimeters: 3.25, letter: 'D-3' },
  { millimeters: 3.5, letter: 'E-4' },
  { millimeters: 3.75, letter: 'F-5' },
  { millimeters: 4, letter: 'G-6' },
  { millimeters: 4.5, letter: '7' },
  { millimeters: 5, letter: 'H-8' },
  { millimeters: 5.5, letter: 'I-9' },
  { millimeters: 6, letter: 'J-10' },
  { millimeters: 6.5, letter: 'K-10.5' },
  { millimeters: 8, letter: 'L-11' },
  { millimeters: 9, letter: 'M/N-13' },
  { millimeters: 10, letter: 'N/P-15' },
] as const;

export function parseHookMillimeters(hook: string): number | null {
  const match = hook.trim().match(/(\d+(?:\.\d+)?)\s*mm/i);
  if (!match?.[1]) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

/** `4` → `4.0 mm`, `3.25` → `3.25 mm`. */
export function formatMillimeterHook(millimeters: number): string {
  const decimals = Number.isInteger(millimeters * 2) ? 1 : 2;
  return `${millimeters.toFixed(decimals)} mm`;
}

/** Spaced form for the device card (`4.0 mm`). Labels that aren't millimeters pass through. */
export function formatHookMillimeters(hook: string): string {
  const value = parseHookMillimeters(hook);
  if (value == null) return formatHookSize(hook);
  return formatMillimeterHook(value);
}

export function hookLetterSize(hook: string): string | null {
  const value = parseHookMillimeters(hook);
  if (value == null) return null;
  const found = HOOK_SIZE_OPTIONS.find((item) => Math.abs(item.millimeters - value) < 0.02);
  return found?.letter ?? null;
}

/** Top-left card badge: `4.0mm · #4`. */
export function formatSpecBadge(pattern: CrochetPattern): string {
  const hook = formatHookSize(pattern.hookSize);
  const number = yarnWeightMeta(pattern.yarnWeight).number;
  return hook === '—' ? number : `${hook} · ${number}`;
}

export function difficultyLabel(difficulty: PatternDifficulty): string {
  if (difficulty === 'easy') return 'Easy';
  if (difficulty === 'beginner') return 'Beginner';
  if (difficulty === 'intermediate') return 'Intermediate';
  return 'Advanced';
}

/** Stable like count so a card doesn't change every render. Not persisted. */
export function displayLikeCount(id: string, isLiked = false): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const base = 80 + (hash >>> 0) % 12400;
  return isLiked ? base + 1 : base;
}

export function formatLikeCount(id: string, isLiked = false): string {
  const count = displayLikeCount(id, isLiked);
  return formatCompactCount(count);
}

function hashPatternMetric(id: string, salt: string, min: number, span: number): number {
  let hash = 2166136261;
  const key = `${salt}:${id}`;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return min + (hash >>> 0) % span;
}

export function displayViewCount(id: string): number {
  return hashPatternMetric(id, 'views', 1200, 890_000);
}

export function displayMakeCount(id: string): number {
  return hashPatternMetric(id, 'makes', 48, 24_000);
}

export function displayCollectCount(id: string): number {
  return hashPatternMetric(id, 'collect', 90, 18_000);
}

export function displayCommentCount(id: string, userCommentCount = 0): number {
  return hashPatternMetric(id, 'comments', 6, 420) + userCommentCount;
}

export function formatCompactCount(count: number): string {
  if (count < 1000) return String(count);
  const scaled = count / 1000;
  const rounded = scaled >= 10 ? Math.round(scaled) : Math.round(scaled * 10) / 10;
  return `${rounded}k`;
}

export function formatViewCount(id: string): string {
  return formatCompactCount(displayViewCount(id));
}

export function formatMakeCount(id: string): string {
  return formatCompactCount(displayMakeCount(id));
}

export function formatCollectCount(id: string): string {
  return formatCompactCount(displayCollectCount(id));
}

export function formatCommentCount(id: string, userCommentCount = 0): string {
  return formatCompactCount(displayCommentCount(id, userCommentCount));
}

export type PatternExtendedMeta = {
  summary: string;
  description: string;
  materials: SeedPatternMaterial[];
  tools: SeedPatternTool[];
  keyStitches: string[];
  estimatedTimeMinutes: number;
  communityReviews: PatternComment[];
};

export function getPatternExtendedMeta(pattern: CrochetPattern): PatternExtendedMeta {
  const seed = SEED_PATTERNS.find((entry) => entry.id === pattern.id);
  const communityReviews = seedCommunityReviewsForPattern(pattern);
  if (seed) {
    const description = seed.description;
    const summary =
      (pattern.summary ?? seed.summary ?? '').trim() || derivePatternSummary(description);
    return {
      summary,
      description,
      materials: seed.materials,
      tools: seed.tools,
      keyStitches: seed.keyStitches,
      estimatedTimeMinutes: seed.estimatedTimeMinutes,
      communityReviews,
    };
  }
  const description = 'Crochet tutorial from the community library.';
  const summary = (pattern.summary ?? '').trim() || derivePatternSummary(description);
  return {
    summary,
    description,
    materials: [{ name: 'Yarn', weight: yarnWeightMeta(pattern.yarnWeight).label, yardage: '—' }],
    tools: [{ type: 'Crochet Hook', size: formatHookSize(pattern.hookSize) }],
    keyStitches: pattern.tags.filter((tag) => tag.includes('crochet') || tag.includes('stitch')).slice(0, 4),
    estimatedTimeMinutes: Math.max(30, pattern.totalRows * 8),
    communityReviews,
  };
}

export function getRelatedPatterns(
  pattern: CrochetPattern,
  allPatterns: readonly CrochetPattern[],
  limit = 8,
): CrochetPattern[] {
  const tagSet = new Set(pattern.tags.map((tag) => tag.toLowerCase()));
  const scored = allPatterns
    .filter((item) => item.id !== pattern.id)
    .map((item) => {
      let score = 0;
      if (item.yarnWeight === pattern.yarnWeight) score += 4;
      if (item.difficulty === pattern.difficulty) score += 3;
      if (item.creator === pattern.creator) score += 5;
      for (const tag of item.tags) {
        if (tagSet.has(tag.toLowerCase())) score += 2;
      }
      return { item, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title));
  return scored.slice(0, limit).map((entry) => entry.item);
}

export function creatorInitials(creator: string): string {
  const parts = creator.split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return '?';
  const last = parts[parts.length - 1];
  if (parts.length === 1 || !last) return first.slice(0, 2).toUpperCase();
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

export function creatorColor(creator: string): string {
  let hash = 0;
  for (const char of creator) hash = (hash + char.charCodeAt(0)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[hash] ?? AVATAR_COLORS[0];
}

export function patternSearchText(pattern: CrochetPattern): string {
  const yarn = yarnWeightMeta(pattern.yarnWeight);
  return [pattern.title, yarn.id, yarn.label, yarn.number, yarn.sizeName, pattern.hookSize, formatHookSize(pattern.hookSize)]
    .join(' ')
    .toLowerCase();
}

export function matchesPatternQuery(pattern: CrochetPattern, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const tagNeedle = needle.startsWith('#') ? needle.slice(1) : needle;
  if (pattern.tags.some((tag) => normalizePatternTag(tag) === tagNeedle)) return true;
  return patternSearchText(pattern).includes(needle);
}

export function normalizePatternTag(tag: string): string {
  return tag.trim().replace(/^#+/, '').toLowerCase();
}

export function patternHasTag(pattern: CrochetPattern, tag: string): boolean {
  const needle = normalizePatternTag(tag);
  if (!needle) return false;
  return pattern.tags.some((item) => normalizePatternTag(item) === needle);
}

export function matchesPatternTagFilter(pattern: CrochetPattern, tagFilter: string | null): boolean {
  if (!tagFilter) return true;
  return patternHasTag(pattern, tagFilter);
}

function matchesScrapeCategory(pattern: CrochetPattern, categoryId: string): boolean {
  if (patternHasTag(pattern, categoryId)) return true;
  const holiday = getHolidayTopic(categoryId);
  if (holiday && patternHasTag(pattern, holiday.tag)) return true;
  const keywords = scrapeCategoryKeywords()[categoryId];
  if (!keywords?.length) return false;
  return mentions(pattern, keywords);
}

export function matchesPatternCategory(pattern: CrochetPattern, category: PatternCategoryId): boolean {
  if (category === 'following' || category === 'for-you' || category === 'trending') {
    return true;
  }
  if (isHolidayTopicId(category)) {
    return matchesScrapeCategory(pattern, category);
  }
  if (isEvergreenScrapeCategory(category)) {
    return matchesScrapeCategory(pattern, category);
  }
  return true;
}

export function sortPatternsForCategory(patterns: readonly CrochetPattern[], category: PatternCategoryId): CrochetPattern[] {
  if (category === 'for-you') return [...patterns].reverse();
  if (category === 'trending') {
    return [...patterns].sort((a, b) => displayLikeCount(b.id) - displayLikeCount(a.id) || a.title.localeCompare(b.title));
  }
  return [...patterns];
}

/** Blank input is "use the store default". Anything else must be a whole number in range. */
export function parseWholeCount(value: string): number | undefined | null {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_COUNT) return null;
  return parsed;
}

function mentions(pattern: CrochetPattern, words: readonly string[]): boolean {
  const title = pattern.title.toLowerCase();
  const tags = pattern.tags.map((tag) => tag.toLowerCase());
  return words.some((word) => {
    if (tags.some((tag) => tag.includes(word))) return true;
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`, 'i').test(title);
  });
}
