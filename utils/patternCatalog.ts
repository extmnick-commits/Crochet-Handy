/**
 * Remote pattern catalog published by the GitHub scraper (`catalog/pattern-catalog.json`).
 */
import Constants from 'expo-constants';

import { parseCatalogPatterns, type CrochetPattern, type YarnWeight } from '@/store/machine';
import { rankScrapCatalog, readTutorialYards, type ScrapRankInput } from '@/utils/scrapCatalogRank';

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

export function loadRepoPatternCatalog(): CrochetPattern[] {
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

export type ScrapCatalogSuggestion = {
  pattern: CrochetPattern;
  yardageNote: string;
};

/**
 * Bundled catalog rows that suit leftover yarn.
 * Rows whose planning size, or a real tutorial yardage, exceeds the entered total are left out.
 * Missing tutorial yardage is never filled in.
 */
export function scrapCatalogSuggestions(options?: {
  yarnWeight?: YarnWeight;
  availableYards?: number;
  limit?: number;
}): ScrapCatalogSuggestion[] {
  const patterns = loadRepoPatternCatalog();
  const ranked = rankScrapCatalog(
    patterns.map((pattern) => toRankInput(pattern)),
    options ?? {},
  );
  const byId = new Map(patterns.map((pattern) => [pattern.id, pattern]));
  return ranked.flatMap((card) => {
    const pattern = byId.get(card.id);
    if (!pattern) return [];
    return [{ pattern, yardageNote: card.yardageNote }];
  });
}

export function patternsForScrapProjects(options?: {
  yarnWeight?: YarnWeight;
  availableYards?: number;
  limit?: number;
}): CrochetPattern[] {
  return scrapCatalogSuggestions(options).map((item) => item.pattern);
}

function toRankInput(pattern: CrochetPattern): ScrapRankInput {
  return {
    id: pattern.id,
    title: pattern.title,
    tags: pattern.tags,
    summary: pattern.summary,
    yarnWeight: pattern.yarnWeight,
    tutorialYards: tutorialYardsFor(pattern.id),
  };
}

let tutorialYardIndex: Map<string, number> | null = null;

function tutorialYardsFor(id: string): number | null {
  if (!tutorialYardIndex) {
    tutorialYardIndex = new Map();
    const rows = (bundledCatalogFile as { patterns?: unknown[] }).patterns;
    if (Array.isArray(rows)) {
      for (const row of rows) {
        if (!row || typeof row !== 'object') continue;
        const record = row as { id?: unknown };
        if (typeof record.id !== 'string') continue;
        const yards = readTutorialYards(record);
        if (yards != null) tutorialYardIndex.set(record.id, yards);
      }
    }
  }
  return tutorialYardIndex.get(id) ?? null;
}
