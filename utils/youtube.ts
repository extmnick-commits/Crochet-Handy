/**
 * YouTube link parser.
 *
 * Accepts the shapes people actually paste from the share sheet and returns a
 * stable video id plus thumbnail URLs. It never throws on bad input — callers
 * get `null` and can show a validation error.
 */

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const MAX_PARSE_DEPTH = 2;

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'youtu.be',
]);

const THUMBNAIL_FILES = {
  maxres: 'maxresdefault.jpg',
  sd: 'sddefault.jpg',
  hq: 'hqdefault.jpg',
  mq: 'mqdefault.jpg',
  default: 'default.jpg',
} as const;

export type YouTubeThumbnailQuality = keyof typeof THUMBNAIL_FILES;

export type YouTubeLinkKind = 'watch' | 'short' | 'embed' | 'live' | 'share' | 'id';

export type ParsedYouTube = {
  videoId: string;
  kind: YouTubeLinkKind;
  /** Always a canonical watch URL, even when the source was a short or youtu.be link. */
  canonicalUrl: string;
  /**
   * Highest-resolution thumbnail YouTube publishes (1280×720).
   * Some videos never get a maxres frame; `thumbnails.hq` exists for every video.
   */
  thumbnailUrl: string;
  thumbnails: Record<YouTubeThumbnailQuality, string>;
};

export function youtubeThumbnailUrl(videoId: string, quality: YouTubeThumbnailQuality = 'maxres'): string {
  return `https://i.ytimg.com/vi/${videoId}/${THUMBNAIL_FILES[quality]}`;
}

export type YouTubeEmbedUrlOptions = {
  startSeconds?: number;
  /** When false, asks the player not to show closed captions (`cc_load_policy=0`). */
  captionsEnabled?: boolean;
  /** Required for IFrame API postMessage commands (seek, captions). */
  origin?: string;
};

/** Origin string for `enablejsapi` embed commands (web vs native WebView). */
export function youtubeEmbedPostMessageOrigin(): string {
  if (typeof globalThis !== 'undefined') {
    const location = (globalThis as { location?: { origin?: string } }).location;
    if (location?.origin && location.origin !== 'null') return location.origin;
  }
  return 'https://www.youtube-nocookie.com';
}

/** Privacy-enhanced embed. `playsinline` keeps the player inside the 16:9 card on iOS. */
export function youtubeEmbedUrl(videoId: string, options?: YouTubeEmbedUrlOptions): string {
  const startSeconds = options?.startSeconds;
  const start =
    startSeconds != null && Number.isFinite(startSeconds) && startSeconds > 0
      ? `&start=${Math.floor(startSeconds)}`
      : '';
  const captions =
    options?.captionsEnabled === true
      ? '&cc_load_policy=1'
      : options?.captionsEnabled === false
        ? '&cc_load_policy=0'
        : '';
  const origin = encodeURIComponent(options?.origin ?? youtubeEmbedPostMessageOrigin());
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?enablejsapi=1&origin=${origin}&rel=0&modestbranding=1&playsinline=1&controls=1${captions}${start}`;
}

export function youtubeCaptionsCommand(enabled: boolean): {
  event: 'command';
  func: 'setOption';
  args: ['captions', 'track', Record<string, string> | null];
} {
  return {
    event: 'command',
    func: 'setOption',
    args: ['captions', 'track', enabled ? { languageCode: 'en' } : null],
  };
}

/** IFrame API command payload to show or hide captions without reloading the embed. */
export function youtubeCaptionsCommandPayload(enabled: boolean): string {
  return JSON.stringify(youtubeCaptionsCommand(enabled));
}

export function buildYouTubeCaptionsScript(enabled: boolean, attempts = 6): string {
  const payload = youtubeCaptionsCommandPayload(enabled);
  return `(function(){function send(){var frame=document.getElementById('yt-player');if(!frame||!frame.contentWindow)return;frame.contentWindow.postMessage(${JSON.stringify(payload)},'*');}send();var n=0;var timer=setInterval(function(){send();n+=1;if(n>=${attempts})clearInterval(timer);},350);})();true;`;
}

export function parseYouTubeUrl(input: string): ParsedYouTube | null {
  return parseYouTube(input, 0);
}

function parseYouTube(input: string, depth: number): ParsedYouTube | null {
  if (typeof input !== 'string' || depth > MAX_PARSE_DEPTH) return null;

  const cleaned = input.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  if (!cleaned) return null;
  if (VIDEO_ID_PATTERN.test(cleaned)) return buildResult(cleaned, 'id');

  let url: URL;
  try {
    url = new URL(withProtocol(cleaned));
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (!YOUTUBE_HOSTS.has(host)) return null;

  const segments = url.pathname
    .split('/')
    .filter(Boolean)
    .map(safeDecode);

  if (segments[0] === 'attribution_link' || segments[0] === 'redirect') {
    const nested = url.searchParams.get('u') ?? url.searchParams.get('q');
    if (!nested) return null;
    return parseYouTube(expandNestedUrl(nested), depth + 1);
  }

  if (host === 'youtu.be') {
    const id = matchVideoId(segments[0] ?? '');
    return id ? buildResult(id, 'share') : null;
  }

  const head = segments[0];
  if (head === 'shorts') {
    const id = matchVideoId(segments[1] ?? '');
    if (id) return buildResult(id, 'short');
  } else if (head === 'embed' || head === 'e') {
    const id = matchVideoId(segments[1] ?? '');
    if (id) return buildResult(id, 'embed');
  } else if (head === 'live') {
    const id = matchVideoId(segments[1] ?? '');
    if (id) return buildResult(id, 'live');
  } else if (head === 'v') {
    const id = matchVideoId(segments[1] ?? '');
    if (id) return buildResult(id, 'watch');
  } else if (head === 'watch') {
    const fromQuery = matchVideoId(url.searchParams.get('v') ?? '');
    if (fromQuery) return buildResult(fromQuery, 'watch');
    const fromPath = matchVideoId(segments[1] ?? '');
    if (fromPath) return buildResult(fromPath, 'watch');
  }

  // Playlist and mobile share links sometimes carry the video only as `?v=`.
  const queryId = matchVideoId(url.searchParams.get('v') ?? '');
  return queryId ? buildResult(queryId, 'watch') : null;
}

function buildResult(videoId: string, kind: YouTubeLinkKind): ParsedYouTube {
  const thumbnails = {
    maxres: youtubeThumbnailUrl(videoId, 'maxres'),
    sd: youtubeThumbnailUrl(videoId, 'sd'),
    hq: youtubeThumbnailUrl(videoId, 'hq'),
    mq: youtubeThumbnailUrl(videoId, 'mq'),
    default: youtubeThumbnailUrl(videoId, 'default'),
  };
  return {
    videoId,
    kind,
    canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
    thumbnailUrl: thumbnails.maxres,
    thumbnails,
  };
}

function withProtocol(value: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
  return `https://${value.replace(/^\/\//, '')}`;
}

function expandNestedUrl(value: string): string {
  const decoded = safeDecode(value).trim();
  if (decoded.startsWith('http://') || decoded.startsWith('https://')) return decoded;
  if (decoded.startsWith('//')) return `https:${decoded}`;
  if (decoded.startsWith('/')) return `https://www.youtube.com${decoded}`;
  return decoded;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Pull a YouTube id off a path segment or query value, ignoring share-sheet junk. */
function matchVideoId(raw: string): string | null {
  const cut = raw.trim().split(/[?&#\s]/)[0] ?? '';
  const stripped = cut.replace(/[)\].,;:!?]+$/g, '');
  return VIDEO_ID_PATTERN.test(stripped) ? stripped : null;
}
