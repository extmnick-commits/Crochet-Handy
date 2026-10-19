/**
 * Fetches crochet tutorials from YouTube, enriches them with Gemini,
 * and appends new `SEED_PATTERNS` entries in store/seed.ts.
 *
 * Run: npx ts-node --project tsconfig.scripts.json scripts/update-patterns.ts
 * Or:  npm run update-patterns
 * Local LM Studio: npm run update-patterns -- --local
 *
 * Batch size: SCRAPE_COUNT or --count (default 10)
 * Topic: SEARCH_TOPIC or --topic (trending | seasonal | amigurumi | wearables | blankets | holiday ids)
 * Seasonal: trending/seasonal auto-target the active holiday window (e.g. halloween in October). Set SCRAPE_SEASONAL=0 to disable.
 * Thumbnail vision: cloud Gemini pass drops foreign on-image text and yarn-only thumbnails. Set SCRAPE_SKIP_THUMBNAIL_CHECK=1 to skip.
 * Dedup: skips any YouTube video id already in store/seed.ts (and catalog/pattern-catalog.json). Paginates search until enough new candidates or SCRAPE_SEARCH_MAX_PAGES.
 * Lookback: SCRAPE_LOOKBACK_DAYS (default 30) for publishedAfter on YouTube search.
 * Transcripts: public captions are fetched for Gemini tagging/difficulty. Set SCRAPE_SKIP_TRANSCRIPT=1 to skip.
 */
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import dotenv from 'dotenv';
import OpenAI from 'openai';

import { type VideoBookmark } from '../utils/chapters';
import {
  applyPrimaryScrapeTopicTag,
  getActiveHolidayTopic,
  resolveScrapeTopic,
  searchQueryForScrapeTopic,
} from '../utils/holidayTopics';
import { isValidEnglishYoutubeSnippet } from '../utils/patternEnglishFilter';
import { batchExtractionSystemPrompt, mapExtractedPattern } from '../utils/patternExtraction';
import { derivePatternSummary } from '../utils/patternSummary';
import { filterVideosByEnglishThumbnailText } from '../utils/thumbnailEnglishFilter';
import { fetchWatchEnrichmentForVideoIds } from '../utils/youtubeTranscript';

type PatternDifficulty = 'beginner' | 'easy' | 'intermediate' | 'advanced';

type YarnWeight =
  | 'lace'
  | 'fingering'
  | 'sport'
  | 'dk'
  | 'worsted'
  | 'aran'
  | 'bulky'
  | 'super-bulky'
  | 'jumbo';

type SeedPatternMaterial = {
  name: string;
  weight: string;
  yardage: string;
};

type SeedPatternTool = {
  type: string;
  size: string;
};

export type SeedPattern = {
  id: string;
  videoId: string;
  youtubeUrl: string;
  thumbnailUrl: string;
  title: string;
  author: string;
  difficulty: PatternDifficulty;
  estimatedTimeMinutes: number;
  description: string;
  summary?: string;
  materials: SeedPatternMaterial[];
  tools: SeedPatternTool[];
  keyStitches: string[];
  yarnWeight: YarnWeight;
  hookSize: string;
  totalRows: number;
  stitchesPerRow: number;
  tags: string[];
  bookmarks: VideoBookmark[];
};

const ROOT = path.resolve(__dirname, '..');
const SEED_FILE = path.join(ROOT, 'store', 'seed.ts');
const CATALOG_FILE = path.join(ROOT, 'catalog', 'pattern-catalog.json');

/** YouTube category 26 = Howto & Style */
const YOUTUBE_VIDEO_CATEGORY_HOWTO = '26';
const YOUTUBE_SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';
const YOUTUBE_VIDEOS_URL = 'https://www.googleapis.com/youtube/v3/videos';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/';
const GEMINI_CLOUD_DEFAULT_MODEL = 'gemini-2.0-flash';
const LM_STUDIO_BASE_URL = 'http://127.0.0.1:1234/v1';
const LM_STUDIO_MODEL = 'local-model';

const SEED_PATTERNS_START = '// <seed-patterns-start>';
const SEED_PATTERNS_END = '// <seed-patterns-end>';

/** Extra text-filtered candidates so thumbnail rejects can still fill the batch. */
const THUMBNAIL_POOL_MULTIPLIER = 4;
const THUMBNAIL_POOL_MIN = 24;

dotenv.config({ path: path.join(ROOT, '.env') });

function readArgValue(flag: string): string | undefined {
  const eq = `--${flag}=`;
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === `--${flag}`) {
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) return next;
    }
    if (arg.startsWith(eq)) return arg.slice(eq.length);
  }
  return undefined;
}

const cliCount = readArgValue('count');
const cliTopic = readArgValue('topic');
if (cliCount) process.env.SCRAPE_COUNT = cliCount;
if (cliTopic) process.env.SEARCH_TOPIC = cliTopic;

const BATCH_SIZE = parseInt(process.env.SCRAPE_COUNT || '10', 10);
const REQUESTED_TOPIC = process.env.SEARCH_TOPIC || 'trending';
const SEARCH_TOPIC = resolveScrapeTopic(REQUESTED_TOPIC);

type YouTubeSearchResponse = {
  items?: YouTubeSearchItem[];
  nextPageToken?: string;
};

type YouTubeSearchItem = {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    description?: string;
    channelTitle?: string;
    publishedAt?: string;
  };
};

type YouTubeVideoItem = {
  id?: string;
  snippet?: {
    title?: string;
    description?: string;
    channelTitle?: string;
    defaultAudioLanguage?: string;
    defaultLanguage?: string;
  };
  contentDetails?: {
    duration?: string;
  };
};

type AiPatternPayload = {
  difficulty?: string;
  estimatedTimeMinutes?: number;
  description?: string;
  summary?: string;
  materials?: { name?: string; weight?: string; yardage?: string }[];
  tools?: { type?: string; size?: string }[];
  keyStitches?: string[];
  yarnWeight?: string;
  hookSize?: string;
  totalRows?: number;
  stitchesPerRow?: number;
  tags?: string[];
  chapters?: { label?: string; time?: string; seconds?: number }[];
};

type AiBatchPatternPayload = AiPatternPayload & {
  videoIndex?: number;
};

type AiBatchPatternsResponse = {
  patterns?: AiBatchPatternPayload[];
};

export function isLocalAiMode(): boolean {
  return process.argv.includes('--local');
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Missing ${name} (set it in .env locally or as a GitHub Actions repository secret)`,
    );
  }
  return value;
}

function publishedAfterIso(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString();
}

function slugifyId(title: string, videoId: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `pattern-${slug || videoId}`.slice(0, 64);
}

function thumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
}

function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/** Keeps English, description-rich embeddable tutorials suitable for pattern extraction. */
export function isValidEnglishPatternVideo(video: YouTubeVideoItem): boolean {
  return isValidEnglishYoutubeSnippet(video.snippet);
}

function logTimestamp(message: string): void {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function publishPatternCatalog(): void {
  execSync('npm run export-pattern-catalog', { cwd: ROOT, stdio: 'inherit' });
}

function formatVideosForBatchPrompt(
  videos: YouTubeVideoItem[],
  transcripts: ReadonlyMap<string, string> = new Map(),
): string {
  return videos
    .map((video, index) => {
      const title = (video.snippet?.title ?? '').trim();
      const description = (video.snippet?.description ?? '').trim();
      const videoId = video.id ?? '';
      const transcript = transcripts.get(videoId);
      const transcriptBlock = transcript
        ? `\nTranscript excerpt (spoken tutorial — prefer for difficulty, stitches, and tags):\n${transcript}`
        : '\nTranscript: (not available — use title and description only)';
      return `Video ${index}:\nTitle: ${title}\nDescription:\n${description}${transcriptBlock}`;
    })
    .join('\n\n---\n\n');
}

export function shouldSkipTranscriptFetch(): boolean {
  const flag = process.env.SCRAPE_SKIP_TRANSCRIPT?.trim().toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'yes';
}

async function fetchJson<T>(url: string, params: Record<string, string>): Promise<T> {
  const query = new URLSearchParams(params);
  const response = await fetch(`${url}?${query.toString()}`);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`YouTube API ${response.status}: ${body.slice(0, 400)}`);
  }
  return (await response.json()) as T;
}

function scrapeLookbackDays(): number {
  const parsed = parseInt(process.env.SCRAPE_LOOKBACK_DAYS ?? '30', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
}

function scrapeSearchMaxPages(): number {
  const parsed = parseInt(process.env.SCRAPE_SEARCH_MAX_PAGES ?? '10', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10;
}

/** Collects new video ids from paginated YouTube search (skips ids already in the catalog). */
export async function collectNewSearchVideoIds(
  apiKey: string,
  existingVideoIds: ReadonlySet<string>,
  poolCap: number,
): Promise<{ ids: string[]; skippedKnown: number; pagesFetched: number }> {
  const ids: string[] = [];
  const blocked = new Set(existingVideoIds);
  let skippedKnown = 0;
  let pageToken: string | undefined;
  let pagesFetched = 0;
  const maxPages = scrapeSearchMaxPages();
  const publishedAfter = publishedAfterIso(scrapeLookbackDays());

  while (ids.length < poolCap && pagesFetched < maxPages) {
    const params: Record<string, string> = {
      part: 'snippet',
      type: 'video',
      relevanceLanguage: 'en',
      q: searchQueryForScrapeTopic(SEARCH_TOPIC),
      videoCategoryId: YOUTUBE_VIDEO_CATEGORY_HOWTO,
      videoDuration: 'medium',
      videoEmbeddable: 'true',
      videoSyndicated: 'true',
      order: 'viewCount',
      publishedAfter,
      maxResults: '50',
      key: apiKey,
    };
    if (pageToken) params.pageToken = pageToken;

    const search = await fetchJson<YouTubeSearchResponse>(YOUTUBE_SEARCH_URL, params);
    pagesFetched += 1;

    for (const item of search.items ?? []) {
      const videoId = item.id?.videoId;
      if (!videoId) continue;
      if (blocked.has(videoId)) {
        skippedKnown += 1;
        continue;
      }
      blocked.add(videoId);
      ids.push(videoId);
      if (ids.length >= poolCap) break;
    }

    pageToken = search.nextPageToken;
    if (!pageToken) break;
  }

  return { ids, skippedKnown, pagesFetched };
}

async function fetchVideoDetailsBatched(
  apiKey: string,
  videoIds: readonly string[],
): Promise<YouTubeVideoItem[]> {
  const items: YouTubeVideoItem[] = [];
  for (let offset = 0; offset < videoIds.length; offset += 50) {
    const chunk = videoIds.slice(offset, offset + 50);
    const details = await fetchJson<{ items?: YouTubeVideoItem[] }>(YOUTUBE_VIDEOS_URL, {
      part: 'snippet,contentDetails',
      id: chunk.join(','),
      key: apiKey,
    });
    items.push(...(details.items ?? []));
  }
  return items;
}

/** Fetches embeddable, syndicated, medium-length crochet tutorials (no Shorts). */
export async function getTrendingVideos(
  apiKey: string,
  existingVideoIds: ReadonlySet<string> = new Set(),
): Promise<YouTubeVideoItem[]> {
  const batchSize = Number.isFinite(BATCH_SIZE) && BATCH_SIZE > 0 ? BATCH_SIZE : 10;
  const poolCap = Math.max(batchSize * THUMBNAIL_POOL_MULTIPLIER, THUMBNAIL_POOL_MIN);

  const { ids, skippedKnown, pagesFetched } = await collectNewSearchVideoIds(
    apiKey,
    existingVideoIds,
    poolCap,
  );

  if (skippedKnown > 0 || pagesFetched > 1) {
    logTimestamp(
      `YouTube search: ${pagesFetched} page(s), skipped ${skippedKnown} already in catalog, ${ids.length} new candidate id(s)`,
    );
  }

  if (ids.length === 0) {
    return [];
  }

  const details = await fetchVideoDetailsBatched(apiKey, ids);

  return details
    .filter((item) => {
      const videoId = item.id ?? '';
      return videoId.length > 0 && !existingVideoIds.has(videoId);
    })
    .filter(isValidEnglishPatternVideo)
    .slice()
    .sort(
      (a, b) =>
        (b.snippet?.description?.length ?? 0) - (a.snippet?.description?.length ?? 0),
    )
    .slice(0, poolCap);
}

export function shouldSkipThumbnailLanguageCheck(isLocal: boolean): boolean {
  if (isLocal) return true;
  const flag = process.env.SCRAPE_SKIP_THUMBNAIL_CHECK?.trim().toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'yes';
}

export async function applyThumbnailLanguageFilter(
  videos: YouTubeVideoItem[],
  client: OpenAI,
  model: string,
  isLocal: boolean,
): Promise<YouTubeVideoItem[]> {
  if (shouldSkipThumbnailLanguageCheck(isLocal) || videos.length === 0) {
    return videos;
  }
  const before = videos.length;
  const filtered = await filterVideosByEnglishThumbnailText(client, model, videos);
  logTimestamp(`Thumbnail language check: kept ${filtered.length}/${before} candidates`);
  return filtered;
}

type AiClientConfig = {
  client: OpenAI;
  model: string;
};

export function buildAiClient(isLocal: boolean): AiClientConfig {
  if (isLocal) {
    return {
      client: new OpenAI({
        apiKey: 'lm-studio',
        baseURL: LM_STUDIO_BASE_URL,
        timeout: 45_000,
      }),
      model: LM_STUDIO_MODEL,
    };
  }

  const apiKey = requireEnv('GEMINI_API_KEY');
  const model = process.env.GEMINI_MODEL?.trim() || GEMINI_CLOUD_DEFAULT_MODEL;
  return {
    client: new OpenAI({
      apiKey,
      baseURL: GEMINI_BASE_URL,
      timeout: 30_000,
      maxRetries: 1,
    }),
    model,
  };
}

export async function extractBatchPatterns(
  client: OpenAI,
  model: string,
  videos: YouTubeVideoItem[],
  transcripts: ReadonlyMap<string, string> = new Map(),
): Promise<AiBatchPatternPayload[]> {
  const completion = await client.chat.completions.create({
    model,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: batchExtractionSystemPrompt(videos.length),
      },
      {
        role: 'user',
        content: formatVideosForBatchPrompt(videos, transcripts),
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new Error('AI returned an empty response');
  }

  const parsed = JSON.parse(raw) as AiBatchPatternsResponse;
  return parsed.patterns ?? [];
}

export function mapBatchPatternsToSeed(
  videos: YouTubeVideoItem[],
  batch: AiBatchPatternPayload[],
  watchBookmarksByVideoId: ReadonlyMap<string, VideoBookmark[]> = new Map(),
  resolvedScrapeTopic?: string,
): SeedPattern[] {
  const byIndex = new Map<number, AiPatternPayload>();
  for (const item of batch) {
    if (typeof item.videoIndex === 'number' && item.videoIndex >= 0 && item.videoIndex < videos.length) {
      byIndex.set(item.videoIndex, item);
    }
  }

  return videos.map((video, index) => {
    const pattern = mergePattern(
      video,
      byIndex.get(index) ?? {},
      watchBookmarksByVideoId.get(video.id ?? '') ?? [],
    );
    if (!resolvedScrapeTopic) return pattern;
    return {
      ...pattern,
      tags: applyPrimaryScrapeTopicTag(pattern.tags, resolvedScrapeTopic),
    };
  });
}

export function mergePattern(
  video: YouTubeVideoItem,
  ai: AiPatternPayload,
  watchBookmarks: readonly VideoBookmark[] = [],
): SeedPattern {
  const videoId = video.id ?? '';
  const mapped = mapExtractedPattern(
    {
      title: video.snippet?.title ?? 'Untitled tutorial',
      creator: video.snippet?.channelTitle ?? 'Unknown',
      description: video.snippet?.description ?? '',
    },
    ai,
    watchBookmarks,
  );

  return {
    id: slugifyId(mapped.title, videoId),
    videoId,
    youtubeUrl: youtubeWatchUrl(videoId),
    thumbnailUrl: thumbnailUrl(videoId),
    title: mapped.title,
    author: mapped.creator,
    difficulty: mapped.difficulty,
    estimatedTimeMinutes: mapped.estimatedTimeMinutes,
    description: mapped.description,
    summary: mapped.summary,
    materials: mapped.materials,
    tools: mapped.tools,
    keyStitches: mapped.keyStitches,
    yarnWeight: mapped.yarnWeight,
    hookSize: mapped.hookSize,
    totalRows: mapped.totalRows,
    stitchesPerRow: mapped.stitchesPerRow,
    tags: mapped.tags,
    bookmarks: mapped.bookmarks,
  };
}

function escapeString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function formatStringArray(values: string[], indent: string): string {
  if (values.length === 0) return '[]';
  const lines = values.map((value) => `${indent}  '${escapeString(value)}',`);
  return `[\n${lines.join('\n')}\n${indent}]`;
}

function formatMaterials(
  materials: SeedPattern['materials'],
  indent: string,
): string {
  if (materials.length === 0) return '[]';
  const lines = materials.map(
    (item) =>
      `${indent}  { name: '${escapeString(item.name)}', weight: '${escapeString(item.weight)}', yardage: '${escapeString(item.yardage)}' },`,
  );
  return `[\n${lines.join('\n')}\n${indent}]`;
}

function formatBookmarks(bookmarks: VideoBookmark[], indent: string): string {
  if (bookmarks.length === 0) return '[]';
  const lines = bookmarks.map((item) => {
    const rowHint =
      item.rowHint != null ? `, rowHint: ${item.rowHint}` : '';
    return `${indent}  { id: '${escapeString(item.id)}', label: '${escapeString(item.label)}', seconds: ${item.seconds}${rowHint} },`;
  });
  return `[\n${lines.join('\n')}\n${indent}]`;
}

function formatTools(tools: SeedPattern['tools'], indent: string): string {
  if (tools.length === 0) return '[]';
  const lines = tools.map(
    (item) =>
      `${indent}  { type: '${escapeString(item.type)}', size: '${escapeString(item.size)}' },`,
  );
  return `[\n${lines.join('\n')}\n${indent}]`;
}

function formatPatternEntries(patterns: SeedPattern[]): string {
  return patterns
    .map((pattern) => {
      const indent = '  ';
      return `${indent}{
${indent}  id: '${escapeString(pattern.id)}',
${indent}  videoId: '${escapeString(pattern.videoId)}',
${indent}  youtubeUrl: '${escapeString(pattern.youtubeUrl)}',
${indent}  thumbnailUrl: '${escapeString(pattern.thumbnailUrl)}',
${indent}  title: '${escapeString(pattern.title)}',
${indent}  author: '${escapeString(pattern.author)}',
${indent}  difficulty: '${pattern.difficulty}',
${indent}  estimatedTimeMinutes: ${pattern.estimatedTimeMinutes},
${indent}  description: '${escapeString(pattern.description)}',
${indent}  summary: '${escapeString(pattern.summary ?? derivePatternSummary(pattern.description))}',
${indent}  materials: ${formatMaterials(pattern.materials, `${indent}  `)},
${indent}  tools: ${formatTools(pattern.tools, `${indent}  `)},
${indent}  keyStitches: ${formatStringArray(pattern.keyStitches, `${indent}  `)},
${indent}  yarnWeight: '${pattern.yarnWeight}',
${indent}  hookSize: '${escapeString(pattern.hookSize)}',
${indent}  totalRows: ${pattern.totalRows},
${indent}  stitchesPerRow: ${pattern.stitchesPerRow},
${indent}  tags: ${formatStringArray(pattern.tags, `${indent}  `)},
${indent}  bookmarks: ${formatBookmarks(pattern.bookmarks, `${indent}  `)},
${indent}},`;
    })
    .join('\n');
}

export function formatSeedPatternsExport(patterns: SeedPattern[]): string {
  const body = formatPatternEntries(patterns);

  return `${SEED_PATTERNS_START}
export const SEED_PATTERNS: SeedPattern[] = [
${body}
];
${SEED_PATTERNS_END}`;
}

function seedPatternsBlock(seedSource: string): string {
  const start = seedSource.indexOf(SEED_PATTERNS_START);
  const end = seedSource.indexOf(SEED_PATTERNS_END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      `Could not find ${SEED_PATTERNS_START} / ${SEED_PATTERNS_END} markers in store/seed.ts`,
    );
  }
  return seedSource.slice(start, end);
}

/** Video ids already exported in the SEED_PATTERNS array. */
export function readExistingVideoIds(seedSource: string): Set<string> {
  const block = seedPatternsBlock(seedSource);
  const ids = new Set<string>();
  for (const match of block.matchAll(/videoId:\s*'([^']+)'/g)) {
    ids.add(match[1]);
  }
  return ids;
}

/** Merges seed file ids with published catalog JSON (same videos, belt-and-suspenders). */
export function readCatalogVideoIds(): Set<string> {
  const ids = new Set<string>();
  if (!fs.existsSync(CATALOG_FILE)) return ids;
  try {
    const raw = JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8')) as {
      patterns?: { videoId?: string }[];
    };
    for (const pattern of raw.patterns ?? []) {
      const videoId = pattern.videoId?.trim();
      if (videoId) ids.add(videoId);
    }
  } catch {
    // Non-fatal: seed.ts is the source of truth when catalog is missing or invalid.
  }
  return ids;
}

export function mergeKnownVideoIds(seedSource: string): Set<string> {
  const ids = readExistingVideoIds(seedSource);
  for (const id of readCatalogVideoIds()) {
    ids.add(id);
  }
  return ids;
}

function readExistingPatternIds(seedSource: string): Set<string> {
  const block = seedPatternsBlock(seedSource);
  const ids = new Set<string>();
  for (const match of block.matchAll(/^\s{4}id:\s*'([^']+)'/gm)) {
    ids.add(match[1]);
  }
  return ids;
}

function withUniquePatternIds(patterns: SeedPattern[], seedSource: string): SeedPattern[] {
  const taken = readExistingPatternIds(seedSource);
  return patterns.map((pattern) => {
    let id = pattern.id;
    if (taken.has(id)) {
      id = `pattern-${pattern.videoId}`.slice(0, 64);
    }
    taken.add(id);
    return id === pattern.id ? pattern : { ...pattern, id };
  });
}

/** Inserts new pattern objects before the SEED_PATTERNS closing bracket. */
export function appendSeedPatterns(seedSource: string, patterns: SeedPattern[]): string {
  if (patterns.length === 0) return seedSource;
  const start = seedSource.indexOf(SEED_PATTERNS_START);
  const end = seedSource.indexOf(SEED_PATTERNS_END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      `Could not find ${SEED_PATTERNS_START} / ${SEED_PATTERNS_END} markers in store/seed.ts`,
    );
  }
  const block = seedSource.slice(start, end);
  const close = block.lastIndexOf('];');
  if (close === -1) {
    throw new Error('Could not find the SEED_PATTERNS array terminator in store/seed.ts');
  }
  const newline = seedSource.includes('\r\n') ? '\r\n' : '\n';
  const formatted = formatPatternEntries(patterns).replace(/\n/g, newline);
  const absolute = start + close;
  return `${seedSource.slice(0, absolute)}${formatted}${newline}${seedSource.slice(absolute)}`;
}

export function replaceSeedPatternsBlock(seedSource: string, block: string): string {
  const start = seedSource.indexOf(SEED_PATTERNS_START);
  const end = seedSource.indexOf(SEED_PATTERNS_END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      `Could not find ${SEED_PATTERNS_START} / ${SEED_PATTERNS_END} markers in store/seed.ts`,
    );
  }
  const afterEnd = end + SEED_PATTERNS_END.length;
  return `${seedSource.slice(0, start)}${block}${seedSource.slice(afterEnd)}`;
}

export async function main(): Promise<void> {
  try {
    const isLocal = isLocalAiMode();
    const youtubeKey = requireEnv('YOUTUBE_API_KEY');
    const seedSource = fs.readFileSync(SEED_FILE, 'utf8');
    const existingIds = mergeKnownVideoIds(seedSource);

    const seasonalNote =
      REQUESTED_TOPIC !== SEARCH_TOPIC
        ? ` (requested: ${REQUESTED_TOPIC}, seasonal: ${getActiveHolidayTopic()?.tag ?? 'none'})`
        : '';
    logTimestamp(
      `YouTube fetch starting (topic: ${SEARCH_TOPIC}${seasonalNote}, batch: ${BATCH_SIZE}, catalog: ${existingIds.size})…`,
    );
    const candidatePool = await getTrendingVideos(youtubeKey, existingIds);
    if (candidatePool.length === 0) {
      logTimestamp(
        `Added 0 new patterns. Catalog now has total of ${existingIds.size} patterns.`,
      );
      return;
    }
    logTimestamp(`YouTube fetch finished (${candidatePool.length} text-filtered candidates)`);

    const { client, model } = buildAiClient(isLocal);

    if (shouldSkipThumbnailLanguageCheck(isLocal)) {
      logTimestamp('Skipping thumbnail language check (--local or SCRAPE_SKIP_THUMBNAIL_CHECK)');
    } else {
      logTimestamp(`Thumbnail language check starting (model: ${model})…`);
    }
    const screened = await applyThumbnailLanguageFilter(candidatePool, client, model, isLocal);
    const batchSize = Number.isFinite(BATCH_SIZE) && BATCH_SIZE > 0 ? BATCH_SIZE : 10;
    const videos = screened.slice(0, batchSize);
    if (videos.length === 0) {
      logTimestamp(
        `Added 0 new patterns after filters. Catalog now has total of ${existingIds.size} patterns.`,
      );
      return;
    }
    logTimestamp(`Using ${videos.length} videos for extraction`);

    const ids = videos.map((video) => video.id ?? '').filter((id) => id.length > 0);
    let transcripts = new Map<string, string>();
    const watchBookmarksByVideoId = new Map<string, VideoBookmark[]>();
    if (shouldSkipTranscriptFetch()) {
      logTimestamp('Skipping caption transcript fetch (SCRAPE_SKIP_TRANSCRIPT)');
      logTimestamp(`Fetching watch-page chapter markers (${ids.length} videos)…`);
    } else {
      logTimestamp(`Fetching watch-page captions and chapter markers (${ids.length} videos)…`);
    }
    const enrichmentStartedAt = Date.now();
    const enrichments = await fetchWatchEnrichmentForVideoIds(ids);
    for (const [videoId, enrichment] of enrichments) {
      if (enrichment.transcript) transcripts.set(videoId, enrichment.transcript);
      if (enrichment.bookmarks.length > 0) watchBookmarksByVideoId.set(videoId, enrichment.bookmarks);
    }
    const enrichmentSeconds = ((Date.now() - enrichmentStartedAt) / 1000).toFixed(1);
    logTimestamp(
      `Watch enrichment ready in ${enrichmentSeconds}s (${transcripts.size}/${ids.length} with captions, ${watchBookmarksByVideoId.size}/${ids.length} with chapters)`,
    );

    logTimestamp(`AI batch extraction starting (${videos.length} videos, model: ${model})…`);
    const aiStartedAt = Date.now();
    const batch = await extractBatchPatterns(client, model, videos, transcripts);
    const aiElapsedSeconds = ((Date.now() - aiStartedAt) / 1000).toFixed(1);
    logTimestamp(
      `AI batch extraction finished in ${aiElapsedSeconds}s (${batch.length} pattern objects)`,
    );

    const seen = new Set(existingIds);
    const patterns = withUniquePatternIds(
      mapBatchPatternsToSeed(videos, batch, watchBookmarksByVideoId, SEARCH_TOPIC).filter((pattern) => {
        if (!pattern.videoId || seen.has(pattern.videoId)) return false;
        seen.add(pattern.videoId);
        return true;
      }),
      seedSource,
    );

    logTimestamp('Appending new patterns to store/seed.ts…');
    const nextSource = appendSeedPatterns(seedSource, patterns);
    fs.writeFileSync(SEED_FILE, nextSource, 'utf8');
    logTimestamp('Publishing catalog/pattern-catalog.json for in-app sync…');
    publishPatternCatalog();
    const total = existingIds.size + patterns.length;
    logTimestamp(`Added ${patterns.length} new patterns. Catalog now has total of ${total} patterns.`);

    for (const pattern of patterns) {
      console.log(`  • ${pattern.title} (${pattern.youtubeUrl})`);
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(`[${new Date().toISOString()}] Fatal error: ${error.message}`);
      if (error.stack) {
        console.error(error.stack);
      }
    } else {
      console.error(`[${new Date().toISOString()}] Fatal error:`, error);
    }
    process.exit(1);
  }
}

const isDirectRun = require.main === module;
if (isDirectRun) {
  void main();
}
