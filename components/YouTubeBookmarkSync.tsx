/**
 * Pull real YouTube chapter timestamps for patterns that have none yet (or still
 * carry the old five-placeholder guide marks from an earlier app version).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { InteractionManager } from 'react-native';

import { useCrochetHydrated, useCrochetStore } from '@/store/useCrochetStore';
import { isEstimatedBookmarkSet, type VideoBookmark } from '@/utils/chapters';
import { fetchYouTubeChapterBookmarks, youtubeChaptersConfigured } from '@/utils/youtubeChapters';

const attempted = new Set<string>();
const BATCH_SIZE = 40;
const START_DELAY_MS = 14_000;

export function YouTubeBookmarkSync() {
  const hydrated = useCrochetHydrated();
  const patternCount = useCrochetStore((state) => state.patterns.length);
  const batchSetPatternBookmarks = useCrochetStore((state) => state.batchSetPatternBookmarks);
  const inFlight = useRef(false);
  const cancelled = useRef(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!hydrated || !youtubeChaptersConfigured()) return undefined;
    const timer = setTimeout(() => setEnabled(true), START_DELAY_MS);
    return () => clearTimeout(timer);
  }, [hydrated]);

  const runBatch = useCallback(() => {
    if (!enabled || inFlight.current || cancelled.current) return;

    const patterns = useCrochetStore.getState().patterns;
    const pending = patterns.filter(
      (pattern) =>
        (pattern.bookmarks.length === 0 || isEstimatedBookmarkSet(pattern.bookmarks)) &&
        !attempted.has(pattern.videoId),
    );
    if (pending.length === 0) return;

    const batch = pending.slice(0, BATCH_SIZE);
    const ids = batch.map((pattern) => pattern.videoId);
    for (const id of ids) attempted.add(id);
    inFlight.current = true;

    void fetchYouTubeChapterBookmarks(ids)
      .then((found) => {
        const updates: { patternId: string; bookmarks: VideoBookmark[] }[] = [];
        for (const pattern of batch) {
          const fromYouTube = found.get(pattern.videoId);
          if (fromYouTube?.length) {
            updates.push({ patternId: pattern.id, bookmarks: fromYouTube });
          } else if (isEstimatedBookmarkSet(pattern.bookmarks)) {
            updates.push({ patternId: pattern.id, bookmarks: [] });
          }
        }
        if (updates.length > 0) batchSetPatternBookmarks(updates);
      })
      .finally(() => {
        inFlight.current = false;
        if (!cancelled.current) {
          InteractionManager.runAfterInteractions(runBatch);
        }
      });
  }, [enabled, batchSetPatternBookmarks]);

  useEffect(() => {
    if (!enabled) return undefined;
    cancelled.current = false;
    const task = InteractionManager.runAfterInteractions(runBatch);
    return () => {
      cancelled.current = true;
      task.cancel();
    };
  }, [enabled, patternCount, runBatch]);

  return null;
}
