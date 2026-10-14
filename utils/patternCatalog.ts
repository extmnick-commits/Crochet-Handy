/**
 * Remote pattern catalog published by the GitHub scraper (`catalog/pattern-catalog.json`).
 */
import Constants from 'expo-constants';

import { parseCatalogPatterns, type CrochetPattern } from '@/store/machine';

/** jsDelivr tracks `main` quickly; raw.githubusercontent.com often lags by hours. */
const DEFAULT_CATALOG_URL =
  'https://cdn.jsdelivr.net/gh/extmnick-commits/Crochet-Handy@main/catalog/pattern-catalog.json';

const FETCH_TIMEOUT_MS = 12_000;

export type PatternCatalogFile = {
  version?: number;
  generatedAt?: string;
  patterns?: unknown[];
};

export function patternCatalogUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_PATTERN_CATALOG_URL?.trim();
  if (fromEnv) return fromEnv;
  const fromExtra = Constants.expoConfig?.extra?.patternCatalogUrl;
  if (typeof fromExtra === 'string' && fromExtra.trim().length > 0) return fromExtra.trim();
  return DEFAULT_CATALOG_URL;
}

function catalogFetchUrl(url: string, bustCache: boolean): string {
  if (!bustCache) return url;
  const joiner = url.includes('?') ? '&' : '?';
  return `${url}${joiner}t=${Date.now()}`;
}

export async function fetchRemotePatternCatalog(
  url = patternCatalogUrl(),
  options?: { bustCache?: boolean },
): Promise<CrochetPattern[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const bustCache = options?.bustCache ?? true;
  try {
    const response = await fetch(catalogFetchUrl(url, bustCache), {
      signal: controller.signal,
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return [];
    const payload = (await response.json()) as PatternCatalogFile;
    return parseCatalogPatterns(payload.patterns);
  } catch (error) {
    if (__DEV__) {
      console.warn('[patternCatalog] fetch failed', error);
    }
    return [];
  } finally {
    clearTimeout(timeout);
  }
}
