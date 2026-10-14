/**
 * Pull real YouTube chapter timestamps for patterns that have none yet (or still
 * carry the old five-placeholder guide marks from an earlier app version).
 */
import { useEffect } from 'react';

import { useCrochetHydrated, useCrochetStore } from '@/store/useCrochetStore';
import { isEstimatedBookmarkSet } from '@/utils/chapters';
import { fetchYouTubeChapterBookmarks } from '@/utils/youtubeChapters';

const attempted = new Set<string>();

export function YouTubeBookmarkSync() {
  const hydrated = useCrochetHydrated();
  const patterns = useCrochetStore((state) => state.patterns);
  const setPatternBookmarks = useCrochetStore((state) => state.setPatternBookmarks);

  useEffect(() => {
    if (!hydrated) return;
    const pending = patterns.filter(
      (pattern) =>
        (pattern.bookmarks.length === 0 || isEstimatedBookmarkSet(pattern.bookmarks)) &&
        !attempted.has(pattern.videoId),
    );
    if (pending.length === 0) return;
    const ids = pending.map((pattern) => pattern.videoId);
    for (const id of ids) attempted.add(id);

    void fetchYouTubeChapterBookmarks(ids).then((found) => {
      const current = useCrochetStore.getState().patterns;
      for (const pattern of current) {
        if (!ids.includes(pattern.videoId)) continue;
        const fromYouTube = found.get(pattern.videoId);
        if (fromYouTube?.length) {
          setPatternBookmarks(pattern.id, fromYouTube);
        } else if (isEstimatedBookmarkSet(pattern.bookmarks)) {
          setPatternBookmarks(pattern.id, []);
        }
      }
    });
  }, [hydrated, patterns, setPatternBookmarks]);

  return null;
}
