/**
 * Catalog preview handoff.
 *
 * Opening a recommendation only changes which sheet is visible. Saving and
 * starting are separate actions.
 */
import type { CrochetPattern, NewPatternInput } from '@/store/machine';

import { patternPosterUri, youtubeThumbnailUrl } from '@/utils/youtube';

export type CatalogPreviewPhase = 'idle' | 'preview' | 'closing-preview';

export type CatalogPreviewFlow<T extends { id: string } = { id: string }> = {
  phase: CatalogPreviewPhase;
  pattern: T | null;
};

export type CatalogPreviewAction = 'preview' | 'back' | 'save' | 'start';

export function idleCatalogPreview<T extends { id: string } = { id: string }>(): CatalogPreviewFlow<T> {
  return { phase: 'idle', pattern: null };
}

/** A second tap while a preview is open keeps the first pattern. */
export function requestCatalogPreview<T extends { id: string }>(
  flow: CatalogPreviewFlow<T>,
  pattern: T,
): CatalogPreviewFlow<T> {
  if (flow.phase === 'preview' || flow.phase === 'closing-preview') return flow;
  return { phase: 'preview', pattern };
}

export function closeCatalogPreview<T extends { id: string }>(flow: CatalogPreviewFlow<T>): CatalogPreviewFlow<T> {
  if (flow.phase !== 'preview') return flow;
  return { phase: 'closing-preview', pattern: flow.pattern };
}

export function previewDismissed<T extends { id: string }>(flow: CatalogPreviewFlow<T>): CatalogPreviewFlow<T> {
  if (flow.phase !== 'closing-preview') return flow;
  return { phase: 'idle', pattern: null };
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
const YOUTUBE_THUMB_HOST = /i\.ytimg\.com\/vi\//i;

/** Ordered fallbacks for `<Image onError>` retry (hq first — catalog maxres links often 404). */
export function patternThumbnailUriCandidates(pattern: {
  thumbnailUrl?: string | null;
  videoId?: string | null;
}): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (uri: string | null | undefined) => {
    if (!uri || seen.has(uri)) return;
    seen.add(uri);
    out.push(uri);
  };
  const videoId = typeof pattern.videoId === 'string' ? pattern.videoId.trim() : '';
  if (videoId.length === 11) {
    add(patternPosterUri(videoId, 'hq'));
    add(youtubeThumbnailUrl(videoId, 'mq'));
    add(youtubeThumbnailUrl(videoId, 'default'));
  }
  const stored = typeof pattern.thumbnailUrl === 'string' ? pattern.thumbnailUrl.trim() : '';
  if (STORED_THUMB.test(stored) && !YOUTUBE_THUMB_HOST.test(stored)) add(stored);
  if (STORED_THUMB.test(stored)) add(stored);
  return out;
}

/** Same poster strategy as the pattern feed: reliable YouTube hq, then other stored art. */
export function recommendationThumbnail(pattern: {
  thumbnailUrl?: string | null;
  videoId?: string | null;
}): RecommendationThumb {
  const primary = patternThumbnailUriCandidates(pattern)[0];
  if (!primary) return { uri: null, source: 'none' };
  return { uri: primary, source: YOUTUBE_THUMB_HOST.test(primary) ? 'youtube' : 'stored' };
}

/** Generated planning ideas are not tutorials and do not borrow a video thumbnail. */
export function generatedIdeaThumbnail(): null {
  return null;
}

export function displayThumbnail(uri: string | null, failed: boolean): string | null {
  if (failed || !uri) return null;
  return uri;
}
