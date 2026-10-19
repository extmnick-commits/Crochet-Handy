/**
 * Catalog preview handoff.
 *
 * Opening a recommendation only changes which sheet is visible. Saving and
 * starting are separate actions, and the yarn draft is left untouched.
 */
import type { CrochetPattern, NewPatternInput } from '@/store/machine';

import { patternPosterUri } from '@/utils/youtube';

export type CatalogPreviewPhase = 'idle' | 'scrap' | 'closing-scrap' | 'preview' | 'closing-preview';

export type CatalogPreviewFlow<T extends { id: string } = { id: string }> = {
  phase: CatalogPreviewPhase;
  pattern: T | null;
};

export type CatalogPreviewAction = 'preview' | 'back' | 'save' | 'start';

export function idleCatalogPreview<T extends { id: string } = { id: string }>(): CatalogPreviewFlow<T> {
  return { phase: 'idle', pattern: null };
}

export function openLeftoverScrap<T extends { id: string }>(flow: CatalogPreviewFlow<T>): CatalogPreviewFlow<T> {
  if (flow.phase === 'preview' || flow.phase === 'closing-scrap' || flow.phase === 'closing-preview') return flow;
  return { phase: 'scrap', pattern: null };
}

export function closeLeftoverScrap<T extends { id: string }>(flow: CatalogPreviewFlow<T>): CatalogPreviewFlow<T> {
  if (flow.phase !== 'scrap') return flow;
  return { phase: 'idle', pattern: null };
}

/** A second tap while a preview is opening keeps the first pattern. */
export function requestCatalogPreview<T extends { id: string }>(
  flow: CatalogPreviewFlow<T>,
  pattern: T,
): CatalogPreviewFlow<T> {
  if (flow.phase === 'closing-scrap' || flow.phase === 'preview' || flow.phase === 'closing-preview') return flow;
  return { phase: 'closing-scrap', pattern };
}

export function scrapDismissed<T extends { id: string }>(flow: CatalogPreviewFlow<T>): CatalogPreviewFlow<T> {
  if (flow.phase !== 'closing-scrap' || !flow.pattern) return flow;
  return { phase: 'preview', pattern: flow.pattern };
}

export function closeCatalogPreview<T extends { id: string }>(flow: CatalogPreviewFlow<T>): CatalogPreviewFlow<T> {
  if (flow.phase !== 'preview') return flow;
  return { phase: 'closing-preview', pattern: flow.pattern };
}

export function previewDismissed<T extends { id: string }>(flow: CatalogPreviewFlow<T>): CatalogPreviewFlow<T> {
  if (flow.phase !== 'closing-preview') return flow;
  return { phase: 'scrap', pattern: null };
}

export function catalogPreviewDecision(action: CatalogPreviewAction): { importPattern: boolean; startProject: boolean } {
  if (action === 'save') return { importPattern: true, startProject: false };
  if (action === 'start') return { importPattern: true, startProject: true };
  return { importPattern: false, startProject: false };
}

/** Preview and Back leave the library unchanged. Save and Start add the id once. */
export function libraryAfterPreview(ids: readonly string[], patternId: string, action: CatalogPreviewAction): string[] {
  const decision = catalogPreviewDecision(action);
  if (!decision.importPattern || ids.includes(patternId)) return [...ids];
  return [...ids, patternId];
}

export function patternToNewInput(pattern: CrochetPattern): NewPatternInput {
  return {
    title: pattern.title,
    creator: pattern.creator,
    youtubeUrl: pattern.youtubeUrl,
    difficulty: pattern.difficulty,
    yarnWeight: pattern.yarnWeight,
    hookSize: pattern.hookSize,
    totalRows: pattern.totalRows,
    stitchesPerRow: pattern.stitchesPerRow,
    tags: pattern.tags,
    summary: pattern.summary,
    bookmarks: pattern.bookmarks,
    videoUrl: pattern.videoUrl,
    source: pattern.source,
    steps: pattern.steps,
  };
}

export type RecommendationThumb = {
  uri: string | null;
  source: 'stored' | 'youtube' | 'none';
};

const STORED_THUMB = /^https:\/\/\S+/i;

/** Stored tutorial art first, then the YouTube poster for that same video. */
export function recommendationThumbnail(pattern: {
  thumbnailUrl?: string | null;
  videoId?: string | null;
}): RecommendationThumb {
  const stored = pattern.thumbnailUrl?.trim() ?? '';
  if (STORED_THUMB.test(stored)) return { uri: stored, source: 'stored' };
  const poster = patternPosterUri(pattern.videoId, 'hq');
  if (poster) return { uri: poster, source: 'youtube' };
  return { uri: null, source: 'none' };
}

/** Generated planning ideas are not tutorials and do not borrow a video thumbnail. */
export function generatedIdeaThumbnail(): null {
  return null;
}

export function displayThumbnail(uri: string | null, failed: boolean): string | null {
  if (failed || !uri) return null;
  return uri;
}
