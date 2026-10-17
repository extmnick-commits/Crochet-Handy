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

type YouTubeVideoSnippet = {
  title?: string;
  description?: string;
  channelTitle?: string;
  defaultAudioLanguage?: string;
  defaultLanguage?: string;
};

type YouTubeVideoItem = {
  id?: string;
  snippet?: YouTubeVideoSnippet;
};

type YouTubeVideosResponse = {
  items?: YouTubeVideoItem[];
};

export type YouTubeVideoDetails = {
  videoId: string;
  title: string;
  channelTitle: string;
  description: string;
  defaultAudioLanguage: string;
  defaultLanguage: string;
  bookmarks: VideoBookmark[];
};

export function youtubeChaptersConfigured(): boolean {
  return youtubeApiKey().length > 0;
}

export async function fetchYouTubeChapterBookmarks(videoIds: readonly string[]): Promise<Map<string, VideoBookmark[]>> {
  const details = await fetchYouTubeVideoDetailsBatch(videoIds);
  const found = new Map<string, VideoBookmark[]>();
  for (const item of details) {
    if (item.bookmarks.length > 0) found.set(item.videoId, item.bookmarks);
  }
  return found;
}

/** Title, channel, description, language, and chapters for one pasted tutorial. */
export async function fetchYouTubeVideoDetails(videoId: string): Promise<YouTubeVideoDetails | null> {
  const [details] = await fetchYouTubeVideoDetailsBatch([videoId]);
  return details ?? null;
}

async function fetchYouTubeVideoDetailsBatch(videoIds: readonly string[]): Promise<YouTubeVideoDetails[]> {
  const key = youtubeApiKey();
  const ids = [...new Set(videoIds.map((id) => id.trim()).filter((id) => /^[A-Za-z0-9_-]{11}$/.test(id)))].slice(
    0,
    MAX_IDS_PER_REQUEST,
  );
  if (!key || ids.length === 0) return [];

  const url = `${YOUTUBE_VIDEOS_URL}?part=snippet&id=${ids.join(',')}&key=${encodeURIComponent(key)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return [];
    const payload = (await response.json()) as YouTubeVideosResponse;
    const items = payload.items ?? [];
    const missing: string[] = [];
    const details = items.flatMap((item) => {
      const videoId = item.id?.trim();
      if (!videoId) return [];
      const bookmarks = extractVideoBookmarks(item.snippet?.description ?? '');
      if (bookmarks.length === 0) missing.push(videoId);
      return [toVideoDetails(videoId, item.snippet, bookmarks)];
    });
    if (missing.length === 0) return details;
    const fromWatch = await fetchWatchEnrichmentForVideoIds(missing, 3);
    return details.map((item) => {
      const watchBookmarks = fromWatch.get(item.videoId)?.bookmarks ?? [];
      if (watchBookmarks.length === 0) return item;
      return { ...item, bookmarks: mergeVideoBookmarks(item.bookmarks, watchBookmarks) };
    });
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function toVideoDetails(
  videoId: string,
  snippet: YouTubeVideoSnippet | undefined,
  bookmarks: VideoBookmark[],
): YouTubeVideoDetails {
  return {
    videoId,
    title: snippet?.title?.trim() ?? '',
    channelTitle: snippet?.channelTitle?.trim() ?? '',
    description: snippet?.description?.trim() ?? '',
    defaultAudioLanguage: snippet?.defaultAudioLanguage?.trim() ?? '',
    defaultLanguage: snippet?.defaultLanguage?.trim() ?? '',
    bookmarks,
  };
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
