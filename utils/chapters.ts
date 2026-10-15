/**
 * YouTube description chapter parsing and smart fallbacks for pattern tutorials.
 */
export type VideoBookmark = {
  id: string;
  label: string;
  seconds: number;
  rowHint?: number;
};

const TIMESTAMP_RE = /(?<![:\d])(\d{1,2}):(\d{2})(?::(\d{2}))?(?![:\d])/g;
const INLINE_CHAPTER_SPLIT_RE = /\s*[,;|]\s*(?=\d{1,2}:\d{2})/g;
const YOUTUBE_URL_TIME_RE = /[?&]t=(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?(?![a-z])/gi;
const MAX_BOOKMARKS = 24;
const MAX_LABEL_CHARS = 48;

function slugForId(label: string, seconds: number): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  return `bm-${seconds}-${slug || 'mark'}`;
}

function parseTimestampParts(h: number, m: number, s: number): number {
  if (!Number.isFinite(h) || !Number.isFinite(m) || !Number.isFinite(s)) return 0;
  if (m > 59 || s > 59) return 0;
  return h * 3600 + m * 60 + s;
}

function normalizeChapterSourceText(text: string): string {
  return text
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[：﹕]/g, ':')
    .replace(/\u00a0/g, ' ');
}

export function parseTimestampToSeconds(raw: string): number {
  const match = normalizeChapterSourceText(raw).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return 0;
  const a = Number(match[1]);
  const b = Number(match[2]);
  const c = match[3] != null ? Number(match[3]) : null;
  if (c == null) return parseTimestampParts(0, a, b);
  return parseTimestampParts(a, b, c);
}

function parseYoutubeUrlTimeToSeconds(raw: string): number {
  const hms = raw.match(/[?&]t=(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/i);
  if (hms) {
    const hours = hms[1] ? Number(hms[1]) : 0;
    const minutes = hms[2] ? Number(hms[2]) : 0;
    const seconds = hms[3] ? Number(hms[3]) : 0;
    if (Number.isFinite(hours) && Number.isFinite(minutes) && Number.isFinite(seconds)) {
      if (hours > 0 || minutes > 0 || seconds > 0) {
        return hours * 3600 + minutes * 60 + seconds;
      }
    }
  }
  const plain = raw.match(/[?&]t=(\d+)/i)?.[1];
  return plain ? Math.max(0, Number(plain)) : 0;
}

function cleanLabel(raw: string): string {
  let label = raw
    .replace(TIMESTAMP_RE, ' ')
    .replace(/[\[\](){}「」【】]/g, ' ')
    .replace(/^[\s•\-–—*·|>]+/, '')
    .replace(/[\s•\-–—*·|]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (label.length > MAX_LABEL_CHARS) {
    label = label.slice(0, MAX_LABEL_CHARS).trim();
  }
  return label;
}

function rowHintFromLabel(label: string): number | undefined {
  const match = label.match(/\brow\s*#?\s*(\d{1,4})\b/i);
  if (!match) return undefined;
  const row = Number(match[1]);
  return Number.isFinite(row) && row > 0 ? row : undefined;
}

function labelFromLine(line: string, timestamp: string, index: number): string {
  const idx = line.indexOf(timestamp);
  if (idx === -1) return cleanLabel(line);
  const before = line.slice(0, idx);
  const after = line.slice(idx + timestamp.length);
  const candidate = after.trim().length >= 2 ? after : before;
  const label = cleanLabel(candidate);
  if (label) return label;
  return `Chapter ${index + 1}`;
}

function ingestChapterLine(line: string, bySeconds: Map<number, VideoBookmark>): void {
  if (!line.trim()) return;

  const matches = [...line.matchAll(TIMESTAMP_RE)];
  if (matches.length === 0) {
    const urlTimeMatches = [...line.matchAll(YOUTUBE_URL_TIME_RE)];
    urlTimeMatches.forEach((match, index) => {
      const token = match[0];
      const seconds = parseYoutubeUrlTimeToSeconds(token);
      if (seconds <= 0) return;
      const label = labelFromLine(line, token, index);
      if (!label || /^https?:\/\//i.test(label)) return;
      const existing = bySeconds.get(seconds);
      if (existing && existing.label.length >= label.length) return;
      const rowHint = rowHintFromLabel(label);
      bySeconds.set(seconds, {
        id: slugForId(label, seconds),
        label,
        seconds,
        ...(rowHint != null ? { rowHint } : {}),
      });
    });
    return;
  }

  matches.forEach((match, index) => {
    const token = match[0];
    const seconds = parseTimestampToSeconds(token);
    const label = labelFromLine(line, token, index);
    if (!label) return;
    const existing = bySeconds.get(seconds);
    if (existing && existing.label.length >= label.length) return;
    const rowHint = rowHintFromLabel(label);
    bySeconds.set(seconds, {
      id: slugForId(label, seconds),
      label,
      seconds,
      ...(rowHint != null ? { rowHint } : {}),
    });
  });
}

function expandChapterLines(text: string): string[] {
  const lines: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (INLINE_CHAPTER_SPLIT_RE.test(line) && (line.match(TIMESTAMP_RE)?.length ?? 0) > 1) {
      for (const piece of line.split(INLINE_CHAPTER_SPLIT_RE)) {
        const trimmed = piece.trim();
        if (trimmed) lines.push(trimmed);
      }
      continue;
    }
    lines.push(line);
  }
  return lines;
}

/**
 * Pull chapter markers from a YouTube description or any pasted tutorial text.
 */
export function extractVideoBookmarks(text: string): VideoBookmark[] {
  const normalized = normalizeChapterSourceText(text);
  if (!normalized.trim()) return [];

  const bySeconds = new Map<number, VideoBookmark>();
  const lines = expandChapterLines(normalized);

  for (const line of lines) ingestChapterLine(line, bySeconds);

  return [...bySeconds.values()]
    .sort((a, b) => a.seconds - b.seconds || a.label.localeCompare(b.label))
    .slice(0, MAX_BOOKMARKS);
}

/** Merge chapter lists from description text, watch-page markers, and AI fallbacks. */
export function resolveVideoBookmarksFromSources(
  ...groups: readonly (readonly VideoBookmark[])[]
): VideoBookmark[] {
  return sanitizeVideoBookmarks(mergeVideoBookmarks(...groups));
}

/** `MM:SS` under one hour; `H:MM:SS` when needed. */
export function formatBookmarkTime(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function generateSmartBookmarks(pattern: {
  totalRows: number;
  keyStitches?: string[];
  durationSeconds?: number;
}): VideoBookmark[] {
  const totalRows = Math.max(1, Math.trunc(pattern.totalRows));
  const duration = Math.max(
    300,
    pattern.durationSeconds ?? Math.max(600, totalRows * 75),
  );
  const stitch =
    pattern.keyStitches?.find((name) => !/^(chain|slip stitch|magic ring)$/i.test(name.trim())) ??
    'Main Stitch Repeat';

  const parts: { label: string; ratio: number; rowHint?: number }[] = [
    { label: 'Materials & Hook', ratio: 0 },
    { label: 'Foundation Chain', ratio: 0.06 },
    { label: 'Row 1', ratio: 0.14, rowHint: 1 },
    { label: stitch, ratio: 0.38 },
    { label: 'Finishing & Border', ratio: 0.82 },
  ];

  return parts.map((part, index) => {
    const seconds = Math.min(duration - 1, Math.round(duration * part.ratio));
    const label =
      part.label.length > MAX_LABEL_CHARS ? part.label.slice(0, MAX_LABEL_CHARS).trim() : part.label;
    return {
      id: slugForId(label, seconds),
      label,
      seconds,
      ...(part.rowHint != null ? { rowHint: part.rowHint } : {}),
    };
  });
}

export function sanitizeVideoBookmarks(input: readonly VideoBookmark[] | undefined): VideoBookmark[] {
  if (!input?.length) return [];

  const seen = new Set<number>();
  const out: VideoBookmark[] = [];

  for (const item of input) {
    if (!item || typeof item.label !== 'string') continue;
    const label = cleanLabel(item.label);
    if (!label) continue;
    const seconds = Math.min(99_999, Math.max(0, Math.trunc(Number(item.seconds) || 0)));
    if (seen.has(seconds)) continue;
    seen.add(seconds);
    const rowHint = item.rowHint != null ? rowHintFromLabel(`row ${item.rowHint}`) ?? item.rowHint : rowHintFromLabel(label);
    const id =
      typeof item.id === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(item.id)
        ? item.id
        : slugForId(label, seconds);
    out.push({
      id,
      label,
      seconds,
      ...(rowHint != null ? { rowHint } : {}),
    });
    if (out.length >= MAX_BOOKMARKS) break;
  }

  return out.sort((a, b) => a.seconds - b.seconds || a.id.localeCompare(b.id));
}

/** True for the five generated guide marks, which real YouTube chapters should replace. */
export function isEstimatedBookmarkSet(bookmarks: readonly VideoBookmark[]): boolean {
  if (bookmarks.length !== 5) return false;
  return (
    bookmarks[0]?.label === 'Materials & Hook' &&
    bookmarks[1]?.label === 'Foundation Chain' &&
    bookmarks[4]?.label === 'Finishing & Border'
  );
}

/** Earlier lists win when two chapters share a timestamp. */
export function mergeVideoBookmarks(...groups: readonly (readonly VideoBookmark[])[]): VideoBookmark[] {
  const bySeconds = new Map<number, VideoBookmark>();
  for (const group of groups) {
    for (const bookmark of group) {
      if (!bySeconds.has(bookmark.seconds)) bySeconds.set(bookmark.seconds, bookmark);
    }
  }
  return [...bySeconds.values()]
    .sort((a, b) => a.seconds - b.seconds || a.label.localeCompare(b.label))
    .slice(0, MAX_BOOKMARKS);
}
