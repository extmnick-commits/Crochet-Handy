/**
 * Fetches public YouTube caption tracks (no Data API quota) for scraper enrichment.
 */

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

export function extractCaptionTracksFromWatchHtml(html: string): CaptionTrack[] {
  const marker = 'ytInitialPlayerResponse = ';
  const start = html.indexOf(marker);
  if (start === -1) return [];
  const jsonStart = start + marker.length;
  if (html[jsonStart] !== '{') return [];

  let depth = 0;
  let inString = false;
  let escaped = false;
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
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(html.slice(jsonStart, i + 1)) as {
            captions?: {
              playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] };
            };
          };
          return parsed.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
        } catch {
          return [];
        }
      }
    }
  }
  return [];
}

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

/** Returns caption plain text or null when captions are unavailable. */
export async function fetchYoutubeTranscriptExcerpt(
  videoId: string,
  maxChars = DEFAULT_TRANSCRIPT_MAX_CHARS,
): Promise<string | null> {
  const id = videoId.trim();
  if (!id) return null;
  try {
    const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
    const html = await fetchText(watchUrl, 20_000);
    const tracks = extractCaptionTracksFromWatchHtml(html);
    const track = pickEnglishCaptionTrack(tracks);
    const baseUrl = track?.baseUrl?.replace(/\\u0026/g, '&');
    if (!baseUrl) return null;

    const captionUrl = baseUrl.includes('fmt=') ? baseUrl : `${baseUrl}&fmt=json3`;
    const payload = await fetchText(captionUrl, 20_000);
    const plain = parseCaptionPayload(payload);
    if (!plain) return null;
    return trimTranscriptForPrompt(plain, maxChars);
  } catch {
    return null;
  }
}

export async function fetchTranscriptsForVideoIds(
  videoIds: readonly string[],
  concurrency = 4,
): Promise<Map<string, string>> {
  const unique = [...new Set(videoIds.map((id) => id.trim()).filter(Boolean))];
  const result = new Map<string, string>();
  if (unique.length === 0) return result;

  let index = 0;
  async function worker(): Promise<void> {
    while (index < unique.length) {
      const current = unique[index];
      index += 1;
      if (!current) continue;
      const excerpt = await fetchYoutubeTranscriptExcerpt(current);
      if (excerpt) result.set(current, excerpt);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, unique.length) }, () => worker());
  await Promise.all(workers);
  return result;
}
