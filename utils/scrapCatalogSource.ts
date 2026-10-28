/** Bundled, offline catalog lookup. Kept independent of the native runtime. */
import { parseCatalogPatterns, type CrochetPattern, type YarnWeight } from '@/store/machine';
import { rankScrapCatalog, readTutorialYards, type ScrapRankInput } from '@/utils/scrapCatalogRank';
import bundledCatalogFile from '../catalog/pattern-catalog.json';

export function loadRepoPatternCatalog(): CrochetPattern[] {
  return parseCatalogPatterns(bundledCatalogFile.patterns);
}

export type ScrapCatalogSuggestion = {
  pattern: CrochetPattern;
  yardageNote: string;
  tutorialYards: number | null;
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
  patterns?: readonly CrochetPattern[];
}): ScrapCatalogSuggestion[] {
  const patterns = options?.patterns ?? loadRepoPatternCatalog();
  const ranked = rankScrapCatalog(
    patterns.map((pattern) => toRankInput(pattern)),
    options ?? {},
  );
  const byId = new Map(patterns.map((pattern) => [pattern.id, pattern]));
  return ranked.flatMap((card) => {
    const pattern = byId.get(card.id);
    if (!pattern) return [];
    return [{ pattern, yardageNote: card.yardageNote, tutorialYards: card.tutorialYards }];
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
