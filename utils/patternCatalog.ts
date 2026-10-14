/**
 * Remote pattern catalog published by the GitHub scraper (`catalog/pattern-catalog.json`).
 */
import Constants from 'expo-constants';

import { parseCatalogPatterns, type CrochetPattern } from '@/store/machine';

const DEFAULT_CATALOG_URL =
  'https://raw.githubusercontent.com/extmnick-commits/Crochet-Handy/main/catalog/pattern-catalog.json';

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

export async function fetchRemotePatternCatalog(
  url = patternCatalogUrl(),
): Promise<CrochetPattern[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return [];
    const payload = (await response.json()) as PatternCatalogFile;
    return parseCatalogPatterns(payload.patterns);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}
