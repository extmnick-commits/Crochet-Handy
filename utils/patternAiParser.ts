/**
 * Detects a tutorial video and stitch lines in a pasted post or URL.
 *
 * YouTube wins when a watch link is present. Otherwise a Facebook watch URL
 * or a blog/file embed is returned. Callers get `null` when nothing playable
 * is found.
 */
import { parseYouTubeUrl } from '@/utils/youtube';

export type PatternVideoSource = 'facebook' | 'web' | 'youtube';

export type DetectedPatternVideo = {
  source: PatternVideoSource;
  /** Canonical watch URL for YouTube. Empty for Facebook and web clips. */
  youtubeUrl: string;
  videoId: string;
  /** Page or file the in-app player should load. */
  videoUrl: string;
  thumbnailUrl: string;
};

const MAX_URL_LENGTH = 500;
const MAX_STEPS = 16;
const MAX_STEP_CHARS = 180;

const EMBED_SRC_PATTERN = /<(?:iframe|video)\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi;
const URL_PATTERN =
  /(?:https?:\/\/|youtu\.be\/|youtube\.com\/|www\.youtube\.com\/|m\.youtube\.com\/|facebook\.com\/|www\.facebook\.com\/|m\.facebook\.com\/|fb\.watch\/|fb\.com\/)[^\s<>"'`)\]]+/gi;

const STEP_START_PATTERN = /^(?:row|rnd|round|step)\s+\d+\b/i;
const NUMBERED_STEP_PATTERN = /^\d+[\).]\s+\S/;
const STITCH_PATTERN =
  /\b(?:sc|dc|hdc|tr|sl\s*st|slip stitch|single crochet|double crochet|half double|chain\s+\d+|ch\s+\d+)\b/i;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const MEDIA_EXTENSION_PATTERN = /\.(mp4|webm|mov|m4v|ogv)$/i;

const SOURCES: ReadonlySet<string> = new Set(['facebook', 'web', 'youtube']);

export function isPatternVideoSource(value: unknown): value is PatternVideoSource {
  return typeof value === 'string' && SOURCES.has(value);
}

/** Drops email addresses so a shared pattern does not carry contact details. */
export function cleanPatternText(value: string, max: number): string | null {
  const text = value.replace(EMAIL_PATTERN, '').replace(/\s+/g, ' ').trim().slice(0, max);
  return text.length > 0 ? text : null;
}

export function normalizeHttpUrl(input: string): string | null {
  const trimmed = input.trim().replace(/[.,);]+$/, '');
  if (!trimmed || trimmed.length > MAX_URL_LENGTH) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if (!url.hostname.includes('.')) return null;
  url.hash = '';
  const href = url.toString();
  return href.length <= MAX_URL_LENGTH ? href : null;
}

export function isDirectMediaUrl(value: string): boolean {
  const normalized = normalizeHttpUrl(value);
  if (!normalized) return false;
  return MEDIA_EXTENSION_PATTERN.test(new URL(normalized).pathname);
}

export function detectPatternVideo(input: { url?: string; text?: string }): DetectedPatternVideo | null {
  const blob = `${input.url ?? ''}\n${input.text ?? ''}`;
  const found = scanForVideo(blob);
  if (found) return found;

  const page = normalizeHttpUrl(input.url ?? '');
  if (!page) return null;
  const youtube = parseYouTubeUrl(page);
  if (youtube) return fromYouTube(youtube.videoId, youtube.canonicalUrl, youtube.thumbnailUrl);
  if (isFacebookUrl(page)) return fromPage('facebook', page);
  return fromPage('web', page);
}

export function extractPatternSteps(input: string): string[] {
  const chunks = input.split(/\r?\n/).flatMap((line) => line.split(/\s*(?=(?:row|rnd|round|step)\s+\d+\b)/i));
  const steps: string[] = [];
  const seen = new Set<string>();
  for (const chunk of chunks) {
    const clean = cleanPatternText(chunk, MAX_STEP_CHARS);
    if (!clean || !isStepLine(clean)) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    steps.push(clean);
    if (steps.length >= MAX_STEPS) break;
  }
  return steps;
}

function scanForVideo(blob: string): DetectedPatternVideo | null {
  const candidates = collectCandidates(blob);
  let facebook: DetectedPatternVideo | null = null;
  let web: DetectedPatternVideo | null = null;
  for (const candidate of candidates) {
    const youtube = parseYouTubeUrl(candidate);
    if (youtube) return fromYouTube(youtube.videoId, youtube.canonicalUrl, youtube.thumbnailUrl);
    const page = normalizeHttpUrl(candidate);
    if (!page) continue;
    if (isFacebookUrl(page)) {
      facebook ??= fromPage('facebook', page);
      continue;
    }
    if (isWebVideoUrl(page)) {
      web ??= fromPage('web', page);
    }
  }
  return facebook ?? web;
}

function collectCandidates(blob: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const push = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    found.push(trimmed);
  };
  for (const match of blob.matchAll(EMBED_SRC_PATTERN)) {
    if (match[1]) push(match[1]);
  }
  for (const match of blob.matchAll(URL_PATTERN)) {
    if (match[0]) push(match[0]);
  }
  return found;
}

function fromYouTube(videoId: string, canonicalUrl: string, thumbnailUrl: string): DetectedPatternVideo {
  return {
    source: 'youtube',
    youtubeUrl: canonicalUrl,
    videoId,
    videoUrl: canonicalUrl,
    thumbnailUrl,
  };
}

function fromPage(source: 'facebook' | 'web', videoUrl: string): DetectedPatternVideo {
  return {
    source,
    youtubeUrl: '',
    videoId: '',
    videoUrl,
    thumbnailUrl: '',
  };
}

/**
 * Facebook watch pages refuse a normal iframe. Their video plugin is the
 * player that can sit in the pattern header.
 */
export function embeddedTutorialUrl(videoUrl: string): string | null {
  const page = normalizeHttpUrl(videoUrl);
  if (!page) return null;
  if (!isFacebookUrl(page)) return page;
  const href = encodeURIComponent(page);
  return `https://www.facebook.com/plugins/video.php?href=${href}&show_text=false&width=560&height=315`;
}

function isFacebookUrl(value: string): boolean {
  try {
    return isFacebookHost(new URL(value).hostname);
  } catch {
    return false;
  }
}

function isFacebookHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, '');
  return host === 'facebook.com' || host === 'm.facebook.com' || host === 'fb.watch' || host === 'fb.com' || host.endsWith('.facebook.com');
}

function isWebVideoUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (MEDIA_EXTENSION_PATTERN.test(url.pathname)) return true;
  const host = url.hostname.toLowerCase();
  if (host === 'vimeo.com' || host.endsWith('.vimeo.com') || host.includes('wistia')) return true;
  const path = url.pathname.toLowerCase();
  return path.includes('/embed') || path.includes('/video') || path.includes('/watch');
}

function isStepLine(line: string): boolean {
  if (line.length < 3) return false;
  if (STEP_START_PATTERN.test(line) || NUMBERED_STEP_PATTERN.test(line)) return true;
  return STITCH_PATTERN.test(line);
}
