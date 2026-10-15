/**
 * Fetches public YouTube watch-page data (captions, structured chapters) for scraper enrichment.
 */

import {
  extractVideoBookmarks,
  mergeVideoBookmarks,
  type VideoBookmark,
} from '@/utils/chapters';

const WATCH_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export const DEFAULT_TRANSCRIPT_MAX_CHARS = 12_000;

type CaptionTrack = {
  baseUrl?: string;
  languageCode?: string;
  kind?: string;
  name?: { simpleText?: string };
};

export function trimTranscriptForPrompt(text: string, maxChars = DEFAULT_TRANSCRIPT_MAX_CHARS): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxChars) return normalized;
  const trimmed = normalized.slice(0, maxChars - 1).replace(/\s+\S*$/, '');
  return `${trimmed}…`;
}

export function parseCaptionXml(payload: string): string {
  const parts: string[] = [];
  const regex = /<text[^>]*>([\s\S]*?)<\/text>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(payload)) !== null) {
    const raw = match[1] ?? '';
    const decoded = decodeCaptionEntities(raw);
    if (decoded) parts.push(decoded);
  }
  return parts.join(' ');
}

export function parseCaptionJson3(payload: string): string {
  try {
    const data = JSON.parse(payload) as {
      events?: { segs?: { utf8?: string }[] }[];
    };
    const parts: string[] = [];
    for (const event of data.events ?? []) {
      for (const seg of event.segs ?? []) {
        const piece = seg.utf8?.replace(/\n/g, ' ').trim();
        if (piece) parts.push(piece);
      }
    }
    return parts.join(' ');
  } catch {
    return '';
  }
}

function decodeCaptionEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseCaptionPayload(payload: string): string {
  const trimmed = payload.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('{')) return parseCaptionJson3(trimmed);
  if (trimmed.includes('<text')) return parseCaptionXml(trimmed);
  return trimmed.replace(/\s+/g, ' ').trim();
}

export function extractScriptVariableJson(html: string, variableName: string): unknown | null {
  const marker = `${variableName} = `;
  const start = html.indexOf(marker);
  if (start === -1) return null;
  const jsonStart = start + marker.length;
  const opener = html[jsonStart];
  if (opener !== '{' && opener !== '[') return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  const openChar = opener;
  const closeChar = opener === '{' ? '}' : ']';

  for (let i = jsonStart; i < html.length; i += 1) {
    const char = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === openChar) depth += 1;
    else if (char === closeChar) {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(jsonStart, i + 1)) as unknown;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export function extractCaptionTracksFromWatchHtml(html: string): CaptionTrack[] {
  const parsed = extractScriptVariableJson(html, 'ytInitialPlayerResponse') as {
    captions?: {
      playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] };
    };
  } | null;
  return parsed?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
}

function simpleTextFromRenderer(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  if (typeof record.simpleText === 'string') return record.simpleText.trim();
  const runs = record.runs;
  if (Array.isArray(runs)) {
    return runs
      .map((run) => {
        if (!run || typeof run !== 'object') return '';
        const text = (run as Record<string, unknown>).text;
        return typeof text === 'string' ? text : '';
      })
      .join('')
      .trim();
  }
  if (typeof record.content === 'string') return record.content.trim();
  return '';
}

function walkJsonTree(node: unknown, visit: (obj: Record<string, unknown>) => void): void {
  if (node == null) return;
  if (Array.isArray(node)) {
    for (const item of node) walkJsonTree(item, visit);
    return;
  }
  if (typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;
  visit(obj);
  for (const value of Object.values(obj)) walkJsonTree(value, visit);
}

function bookmarkFromMacroMarker(renderer: Record<string, unknown>): VideoBookmark | null {
  const title = simpleTextFromRenderer(renderer.title);
  if (!title) return null;

  const onTap = renderer.onTap;
  let seconds = 0;
  if (onTap && typeof onTap === 'object') {
    const command = (onTap as Record<string, unknown>).innertubeCommand;
    if (command && typeof command === 'object') {
      const seek = (command as Record<string, unknown>).seekToCommand;
      if (seek && typeof seek === 'object') {
        const start = Number((seek as Record<string, unknown>).startTimeSeconds);
        if (Number.isFinite(start) && start >= 0) seconds = Math.trunc(start);
      }
    }
  }
  if (seconds === 0) {
    const timeLabel = simpleTextFromRenderer(renderer.timeDescription);
    if (timeLabel) seconds = extractVideoBookmarks(`${timeLabel} ${title}`)[0]?.seconds ?? 0;
  }
  if (!Number.isFinite(seconds) || seconds < 0) return null;

  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  return {
    id: `bm-${seconds}-${slug || 'mark'}`,
    label: title,
    seconds,
  };
}

export function extractMacroMarkerBookmarksFromWatchJson(...roots: readonly unknown[]): VideoBookmark[] {
  const found: VideoBookmark[] = [];
  for (const root of roots) {
    if (!root) continue;
    walkJsonTree(root, (obj) => {
      const marker = obj.macroMarkersListItemRenderer;
      if (!marker || typeof marker !== 'object') return;
      const bookmark = bookmarkFromMacroMarker(marker as Record<string, unknown>);
      if (bookmark) found.push(bookmark);
    });
  }
  return mergeVideoBookmarks(found);
}

function extractDescriptionBookmarkCandidatesFromWatchJson(...roots: readonly unknown[]): VideoBookmark[] {
  const texts: string[] = [];
  for (const root of roots) {
    if (!root) continue;
    walkJsonTree(root, (obj) => {
      for (const key of ['attributedDescriptionBodyText', 'expandableVideoDescriptionBodyRenderer', 'descriptionBodyText']) {
        const value = obj[key];
        const text = simpleTextFromRenderer(value);
        if (text.length >= 24 && /\d{1,2}:\d{2}/.test(text)) texts.push(text);
      }
      if (typeof obj.content === 'string' && obj.content.length >= 24 && /\d{1,2}:\d{2}/.test(obj.content)) {
        texts.push(obj.content);
      }
    });
  }
  return mergeVideoBookmarks(...texts.map((text) => extractVideoBookmarks(text)));
}

export function extractChapterBookmarksFromWatchHtml(html: string): VideoBookmark[] {
  const player = extractScriptVariableJson(html, 'ytInitialPlayerResponse');
  const initialData = extractScriptVariableJson(html, 'ytInitialData');
  const fromMarkers = extractMacroMarkerBookmarksFromWatchJson(player, initialData);
  const fromDescriptions = extractDescriptionBookmarkCandidatesFromWatchJson(player, initialData);
  return mergeVideoBookmarks(fromMarkers, fromDescriptions);
}

export type WatchPageEnrichment = {
  transcript: string | null;
  bookmarks: VideoBookmark[];
};

function pickEnglishCaptionTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  if (tracks.length === 0) return null;
  const score = (track: CaptionTrack): number => {
    const code = (track.languageCode ?? '').toLowerCase();
    if (code === 'en') return 4;
    if (code.startsWith('en-')) return 3;
    if (track.kind === 'asr' && code.startsWith('en')) return 2;
    if (code.includes('en')) return 1;
    return 0;
  };
  return [...tracks].sort((a, b) => score(b) - score(a))[0] ?? null;
}

async function fetchText(url: string, timeoutMs: number): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': WATCH_USER_AGENT,
      'Accept-Language': 'en-US,en;q=0.9',
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.text();
}

async function fetchWatchPageHtml(videoId: string): Promise<string> {
  const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  return fetchText(watchUrl, 20_000);
}

export async function fetchYoutubeWatchPageEnrichment(
  videoId: string,
  maxChars = DEFAULT_TRANSCRIPT_MAX_CHARS,
): Promise<WatchPageEnrichment> {
  const id = videoId.trim();
  if (!id) return { transcript: null, bookmarks: [] };
  try {
    const html = await fetchWatchPageHtml(id);
    const bookmarks = extractChapterBookmarksFromWatchHtml(html);
    const tracks = extractCaptionTracksFromWatchHtml(html);
    const track = pickEnglishCaptionTrack(tracks);
    const baseUrl = track?.baseUrl?.replace(/\\u0026/g, '&');
    if (!baseUrl) return { transcript: null, bookmarks };

    const captionUrl = baseUrl.includes('fmt=') ? baseUrl : `${baseUrl}&fmt=json3`;
    const payload = await fetchText(captionUrl, 20_000);
    const plain = parseCaptionPayload(payload);
    if (!plain) return { transcript: null, bookmarks };
    return {
      transcript: trimTranscriptForPrompt(plain, maxChars),
      bookmarks,
    };
  } catch {
    return { transcript: null, bookmarks: [] };
  }
}

/** Returns caption plain text or null when captions are unavailable. */
export async function fetchYoutubeTranscriptExcerpt(
  videoId: string,
  maxChars = DEFAULT_TRANSCRIPT_MAX_CHARS,
): Promise<string | null> {
  const enrichment = await fetchYoutubeWatchPageEnrichment(videoId, maxChars);
  return enrichment.transcript;
}

export async function fetchTranscriptsForVideoIds(
  videoIds: readonly string[],
  concurrency = 4,
): Promise<Map<string, string>> {
  const enrichment = await fetchWatchEnrichmentForVideoIds(videoIds, concurrency);
  const result = new Map<string, string>();
  for (const [id, value] of enrichment) {
    if (value.transcript) result.set(id, value.transcript);
  }
  return result;
}

export async function fetchWatchEnrichmentForVideoIds(
  videoIds: readonly string[],
  concurrency = 4,
): Promise<Map<string, WatchPageEnrichment>> {
  const unique = [...new Set(videoIds.map((id) => id.trim()).filter(Boolean))];
  const result = new Map<string, WatchPageEnrichment>();
  if (unique.length === 0) return result;

  let index = 0;
  async function worker(): Promise<void> {
    while (index < unique.length) {
      const current = unique[index];
      index += 1;
      if (!current) continue;
      const enrichment = await fetchYoutubeWatchPageEnrichment(current);
      if (enrichment.transcript || enrichment.bookmarks.length > 0) {
        result.set(current, enrichment);
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, unique.length) }, () => worker());
  await Promise.all(workers);
  return result;
}
