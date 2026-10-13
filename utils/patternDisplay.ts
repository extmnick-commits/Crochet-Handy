/**
 * Display helpers for the Patterns feed.
 *
 * Yarn "size" is the Craft Yarn Council number (#4 worsted, #3 DK, …).
 * Hook sizes are normalized to the compact badge form used on cards (`4.0mm`).
 */
import { MAX_COUNT, type CrochetPattern, type PatternDifficulty, type YarnWeight } from '@/store/machine';

export type PatternCategoryId = 'following' | 'for-you' | 'trending' | 'halloween' | 'amigurumi' | 'wearables';

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

const WEARABLE_WORDS = [
  'wearable',
  'cardigan',
  'sweater',
  'jumper',
  'pullover',
  'hat',
  'beanie',
  'scarf',
  'shawl',
  'duster',
  'sock',
  'glove',
  'mitten',
  'cowl',
  'vest',
  'hoodie',
  'dress',
] as const;

const AMIGURUMI_WORDS = ['amigurumi', 'plush', 'plushie', 'doll', 'stuffie', 'toy'] as const;

const HALLOWEEN_WORDS = ['halloween', 'pumpkin', 'spooky', 'ghost', 'bat', 'witch', 'skull', 'spider', 'autumn', 'october'] as const;

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
export function displayLikeCount(id: string): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return 80 + (hash >>> 0) % 12400;
}

export function formatLikeCount(id: string): string {
  const count = displayLikeCount(id);
  if (count < 1000) return String(count);
  const scaled = count / 1000;
  const rounded = scaled >= 10 ? Math.round(scaled) : Math.round(scaled * 10) / 10;
  return `${rounded}k`;
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
  return patternSearchText(pattern).includes(needle);
}

export function matchesPatternCategory(pattern: CrochetPattern, category: PatternCategoryId): boolean {
  if (category === 'halloween') return mentions(pattern, HALLOWEEN_WORDS);
  if (category === 'amigurumi') return mentions(pattern, AMIGURUMI_WORDS);
  if (category === 'wearables') return mentions(pattern, WEARABLE_WORDS);
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
