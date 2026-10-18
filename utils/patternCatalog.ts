/**
 * Remote pattern catalog published by the GitHub scraper (`catalog/pattern-catalog.json`).
 */
import Constants from 'expo-constants';

import { parseCatalogPatterns, type CrochetPattern, type YarnWeight } from '@/store/machine';

import bundledCatalogFile from '../catalog/pattern-catalog.json';

const JSDELIVR_CATALOG_URL =
  'https://cdn.jsdelivr.net/gh/extmnick-commits/Crochet-Handy@main/catalog/pattern-catalog.json';
const RAW_GITHUB_CATALOG_URL =
  'https://raw.githubusercontent.com/extmnick-commits/Crochet-Handy/main/catalog/pattern-catalog.json';

/** Primary feed URL (jsDelivr); raw GitHub is tried when the CDN snapshot is stale. */
const DEFAULT_CATALOG_URL = JSDELIVR_CATALOG_URL;

const FETCH_TIMEOUT_MS = 12_000;

export type PatternCatalogFile = {
  version?: number;
  generatedAt?: string;
  patterns?: unknown[];
};

export function patternCatalogUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_PATTERN_CATALOG_URL?.trim();
  if (fromEnv) return fromEnv;
  if (__DEV__ && process.env.EXPO_PUBLIC_PATTERN_CATALOG_REMOTE !== '1') {
    return '';
  }
  const fromExtra = Constants.expoConfig?.extra?.patternCatalogUrl;
  if (typeof fromExtra === 'string' && fromExtra.trim().length > 0) return fromExtra.trim();
  return DEFAULT_CATALOG_URL;
}

function loadRepoPatternCatalog(): CrochetPattern[] {
  const payload = bundledCatalogFile as PatternCatalogFile;
  return parseCatalogPatterns(payload.patterns);
}

function catalogFetchUrl(url: string, bustCache: boolean): string {
  if (!bustCache) return url;
  const joiner = url.includes('?') ? '&' : '?';
  return `${url}${joiner}t=${Date.now()}`;
}

async function fetchPatternCatalogFromUrl(
  url: string,
  bustCache: boolean,
): Promise<CrochetPattern[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(catalogFetchUrl(url, bustCache), {
      signal: controller.signal,
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return [];
    const payload = (await response.json()) as PatternCatalogFile;
    return parseCatalogPatterns(payload.patterns);
  } finally {
    clearTimeout(timeout);
  }
}

function catalogFetchCandidates(primaryUrl: string): string[] {
  const trimmed = primaryUrl.trim();
  if (!trimmed) return [];
  if (trimmed === JSDELIVR_CATALOG_URL || trimmed === DEFAULT_CATALOG_URL) {
    return [JSDELIVR_CATALOG_URL, RAW_GITHUB_CATALOG_URL];
  }
  return [trimmed];
}

export async function fetchRemotePatternCatalog(
  url = patternCatalogUrl(),
  options?: { bustCache?: boolean },
): Promise<CrochetPattern[]> {
  if (!url.trim()) {
    return loadRepoPatternCatalog();
  }

  const bustCache = options?.bustCache ?? true;
  const candidates = catalogFetchCandidates(url);
  let best: CrochetPattern[] = [];
  for (const candidate of candidates) {
    try {
      const patterns = await fetchPatternCatalogFromUrl(candidate, bustCache);
      if (patterns.length > best.length) {
        best = patterns;
      }
    } catch (error) {
      if (__DEV__) {
        console.warn('[patternCatalog] fetch failed', candidate, error);
      }
    }
  }
  return best;
}

const SCRAP_HINTS = [
  'amigurumi',
  'plush',
  'plushie',
  'doll',
  'keychain',
  'coaster',
  'scrunchie',
  'ornament',
  'applique',
  'appliqué',
  'dishcloth',
  'washcloth',
  'headband',
  'ear warmer',
  'flower',
  'bookmark',
  'charm',
  'mini',
] as const;

function patternHaystack(pattern: CrochetPattern): string {
  return `${pattern.title} ${pattern.tags.join(' ')} ${pattern.summary ?? ''}`.toLowerCase();
}

function mentionsHint(pattern: CrochetPattern, hint: string): boolean {
  const needle = hint.toLowerCase();
  if (pattern.tags.some((tag) => tag.toLowerCase().includes(needle))) return true;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`, 'i').test(patternHaystack(pattern));
}

function isScrapFriendlyPattern(pattern: CrochetPattern): boolean {
  return SCRAP_HINTS.some((hint) => mentionsHint(pattern, hint));
}

function scoreScrapPattern(pattern: CrochetPattern, yarnWeight?: YarnWeight): number {
  const text = patternHaystack(pattern);
  let score = 0;
  if (yarnWeight && pattern.yarnWeight === yarnWeight) score += 5;
  if (mentionsHint(pattern, 'amigurumi') || mentionsHint(pattern, 'plushie') || text.includes('plush')) score += 3;
  if (mentionsHint(pattern, 'keychain') || mentionsHint(pattern, 'coaster') || mentionsHint(pattern, 'scrunchie')) {
    score += 2;
  }
  if (mentionsHint(pattern, 'mini')) score += 1;
  return score;
}

/**
 * Bundled catalog rows that suit leftover yarn: amigurumi, keychains, coasters,
 * and other small or medium makes. Same-weight matches sort first.
 */
export function patternsForScrapProjects(options?: { yarnWeight?: YarnWeight; limit?: number }): CrochetPattern[] {
  const limit = options?.limit ?? 6;
  const yarnWeight = options?.yarnWeight;
  return loadRepoPatternCatalog()
    .filter(isScrapFriendlyPattern)
    .sort((a, b) => scoreScrapPattern(b, yarnWeight) - scoreScrapPattern(a, yarnWeight) || a.title.localeCompare(b.title))
    .slice(0, Math.max(0, limit));
}
