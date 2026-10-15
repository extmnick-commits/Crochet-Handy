/**
 * Read chapter timestamps from a YouTube video description.
 *
 * Creators publish chapters as lines like `02:15 Row 1` in the description.
 * The Data API returns that text; this module turns it into bookmarks.
 */
import Constants from 'expo-constants';

import { extractVideoBookmarks, mergeVideoBookmarks, type VideoBookmark } from '@/utils/chapters';
import { fetchWatchEnrichmentForVideoIds } from '@/utils/youtubeTranscript';

const YOUTUBE_VIDEOS_URL = 'https://www.googleapis.com/youtube/v3/videos';
const MAX_IDS_PER_REQUEST = 50;
const REQUEST_TIMEOUT_MS = 8000;

type YouTubeVideosResponse = {
  items?: {
    id?: string;
    snippet?: { description?: string };
  }[];
};

export function youtubeChaptersConfigured(): boolean {
  return youtubeApiKey().length > 0;
}

export async function fetchYouTubeChapterBookmarks(videoIds: readonly string[]): Promise<Map<string, VideoBookmark[]>> {
  const found = new Map<string, VideoBookmark[]>();
  const key = youtubeApiKey();
  const ids = [...new Set(videoIds.map((id) => id.trim()).filter((id) => /^[A-Za-z0-9_-]{11}$/.test(id)))].slice(
    0,
    MAX_IDS_PER_REQUEST,
  );
  if (!key || ids.length === 0) return found;

  const url = `${YOUTUBE_VIDEOS_URL}?part=snippet&id=${ids.join(',')}&key=${encodeURIComponent(key)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return found;
    const payload = (await response.json()) as YouTubeVideosResponse;
    const missing: string[] = [];
    for (const item of payload.items ?? []) {
      if (!item.id) continue;
      const bookmarks = extractVideoBookmarks(item.snippet?.description ?? '');
      if (bookmarks.length > 0) {
        found.set(item.id, bookmarks);
      } else {
        missing.push(item.id);
      }
    }
    if (missing.length > 0) {
      const fromWatch = await fetchWatchEnrichmentForVideoIds(missing, 3);
      for (const id of missing) {
        const watchBookmarks = fromWatch.get(id)?.bookmarks ?? [];
        if (watchBookmarks.length > 0) {
          found.set(id, mergeVideoBookmarks(found.get(id) ?? [], watchBookmarks));
        }
      }
    }
    return found;
  } catch {
    return found;
  } finally {
    clearTimeout(timer);
  }
}

function youtubeApiKey(): string {
  const fromPublic = process.env.EXPO_PUBLIC_YOUTUBE_API_KEY?.trim();
  if (fromPublic) return fromPublic;
  const extra = Constants.expoConfig?.extra;
  if (extra && typeof extra === 'object' && 'youtubeApiKey' in extra && typeof extra.youtubeApiKey === 'string') {
    return extra.youtubeApiKey.trim();
  }
  return '';
}
