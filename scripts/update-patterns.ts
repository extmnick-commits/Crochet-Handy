/**
 * Fetches crochet tutorials from YouTube, enriches them with Gemini,
 * and appends new `SEED_PATTERNS` entries in store/seed.ts.
 *
 * Run: npx ts-node --project tsconfig.scripts.json scripts/update-patterns.ts
 * Or:  npm run update-patterns
 * Local LM Studio: npm run update-patterns -- --local
 *
 * Batch size: SCRAPE_COUNT or --count (default 10)
 * Topic: SEARCH_TOPIC or --topic (trending | amigurumi | wearables | blankets)
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import dotenv from 'dotenv';
import OpenAI from 'openai';

import {
  extractVideoBookmarks,
  type VideoBookmark,
} from '../utils/chapters';

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

const YARN_WEIGHTS: readonly YarnWeight[] = [
  'lace',
  'fingering',
  'sport',
  'dk',
  'worsted',
  'aran',
  'bulky',
  'super-bulky',
  'jumbo',
];

type SeedPatternMaterial = {
  name: string;
  weight: string;
  yardage: string;
};

type SeedPatternTool = {
  type: string;
  size: string;
};

type SeedPattern = {
  id: string;
  videoId: string;
  youtubeUrl: string;
  thumbnailUrl: string;
  title: string;
  author: string;
  difficulty: PatternDifficulty;
  estimatedTimeMinutes: number;
  description: string;
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
const SEARCH_TOPIC = process.env.SEARCH_TOPIC || 'trending';

/** Long-form project tutorials only; API params also block Shorts and non-embeddable videos. */
function searchQueryForTopic(topic: string): string {
  if (topic === 'amigurumi') {
    return '("crochet amigurumi" | "crochet plushie") ("tutorial" | "pattern") -shorts';
  }
  if (topic === 'wearables') {
    return '("crochet sweater" | "crochet cardigan" | "crochet top") ("tutorial" | "pattern") -shorts';
  }
  if (topic === 'blankets') {
    return '("crochet blanket" | "crochet granny square") ("tutorial" | "pattern") -shorts';
  }
  return '("crochet tutorial" | "crochet pattern") ("step by step" | "full project" | "pattern") -shorts';
}

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
  };
  statistics?: {
    viewCount?: string;
  };
};

type AiPatternPayload = {
  difficulty?: string;
  estimatedTimeMinutes?: number;
  description?: string;
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

const BATCH_DESCRIPTION_MAX_CHARS = 400;

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

function normalizeDifficulty(value: string | undefined): PatternDifficulty {
  const key = (value ?? '').trim().toLowerCase();
  if (key === 'beginner' || key === 'easy' || key === 'intermediate' || key === 'advanced') {
    return key;
  }
  return 'easy';
}

function normalizeYarnWeight(value: string | undefined): YarnWeight {
  const raw = (value ?? '').trim().toLowerCase().replace(/\s+/g, '-');
  const aliases: Record<string, YarnWeight> = {
    '4-ply': 'sport',
    '5-ply': 'sport',
    '8-ply': 'dk',
    '10-ply': 'aran',
    'chunky': 'bulky',
    'super-chunky': 'super-bulky',
  };
  const candidate = aliases[raw] ?? raw;
  if ((YARN_WEIGHTS as readonly string[]).includes(candidate)) {
    return candidate as YarnWeight;
  }
  return 'worsted';
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function thumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
}

function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/** Fallback defense when Shorts slip through search filters. */
function isShortFormTitle(title: string): boolean {
  const lower = title.toLowerCase();
  return lower.includes('#shorts') || lower.includes('#short');
}

function logTimestamp(message: string): void {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function formatVideosForBatchPrompt(videos: YouTubeVideoItem[]): string {
  return videos
    .map((video, index) => {
      const title = (video.snippet?.title ?? '').trim();
      const description = (video.snippet?.description ?? '').slice(0, BATCH_DESCRIPTION_MAX_CHARS);
      return `Video ${index}:\nTitle: ${title}\nDescription:\n${description}`;
    })
    .join('\n\n---\n\n');
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

/** Fetches embeddable, syndicated, medium-length crochet tutorials (no Shorts). */
export async function getTrendingVideos(
  apiKey: string,
  existingVideoIds: ReadonlySet<string> = new Set(),
): Promise<YouTubeVideoItem[]> {
  const search = await fetchJson<{ items?: YouTubeSearchItem[] }>(YOUTUBE_SEARCH_URL, {
    part: 'snippet',
    type: 'video',
    q: searchQueryForTopic(SEARCH_TOPIC),
    videoCategoryId: YOUTUBE_VIDEO_CATEGORY_HOWTO,
    videoDuration: 'medium',
    videoEmbeddable: 'true',
    videoSyndicated: 'true',
    order: 'viewCount',
    publishedAfter: publishedAfterIso(7),
    maxResults: '25',
    key: apiKey,
  });

  const ids = (search.items ?? [])
    .filter((item) => !isShortFormTitle(item.snippet?.title ?? ''))
    .map((item) => item.id?.videoId)
    .filter((id): id is string => Boolean(id))
    .filter((id) => !existingVideoIds.has(id));

  if (ids.length === 0) {
    return [];
  }

  const details = await fetchJson<{ items?: YouTubeVideoItem[] }>(YOUTUBE_VIDEOS_URL, {
    part: 'snippet,statistics',
    id: ids.join(','),
    key: apiKey,
  });

  const batchSize = Number.isFinite(BATCH_SIZE) && BATCH_SIZE > 0 ? BATCH_SIZE : 10;
  return (details.items ?? [])
    .filter((item) => !isShortFormTitle(item.snippet?.title ?? ''))
    .filter((item) => {
      const videoId = item.id ?? '';
      return videoId.length > 0 && !existingVideoIds.has(videoId);
    })
    .slice()
    .sort((a, b) => Number(b.statistics?.viewCount ?? 0) - Number(a.statistics?.viewCount ?? 0))
    .slice(0, batchSize);
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
): Promise<AiBatchPatternPayload[]> {
  const completion = await client.chat.completions.create({
    model,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: [
          `Analyze these ${videos.length} crochet YouTube videos and extract project details for each.`,
          'Return strict JSON only: { "patterns": [ ... ] }.',
          'Each item must include videoIndex (0-based, matching Video N in the user message),',
          'difficulty (Beginner|Easy|Intermediate|Advanced), estimatedTimeMinutes, description,',
          'materials [{ name, weight, yardage }], tools [{ type, size }], keyStitches [string],',
          'yarnWeight (lace|fingering|sport|dk|worsted|aran|bulky|super-bulky|jumbo), hookSize,',
          'totalRows, stitchesPerRow,',
          'tags [string] (include relevant category tags such as amigurumi, wearables, halloween, blanket, bag alongside key stitches),',
          'chapters [{ label, time }] when the description lists timestamps (time as M:SS or H:MM:SS).',
          `Include exactly ${videos.length} entries with videoIndex 0 through ${videos.length - 1}.`,
          'Infer reasonable values when a video omits them.',
        ].join(' '),
      },
      {
        role: 'user',
        content: formatVideosForBatchPrompt(videos),
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
): SeedPattern[] {
  const byIndex = new Map<number, AiPatternPayload>();
  for (const item of batch) {
    if (typeof item.videoIndex === 'number' && item.videoIndex >= 0 && item.videoIndex < videos.length) {
      byIndex.set(item.videoIndex, item);
    }
  }

  return videos.map((video, index) => mergePattern(video, byIndex.get(index) ?? {}));
}

function bookmarksFromAiChapters(chapters: AiPatternPayload['chapters']): VideoBookmark[] {
  if (!chapters?.length) return [];
  const out: VideoBookmark[] = [];
  for (const chapter of chapters) {
    const label = String(chapter.label ?? '').trim();
    if (!label) continue;
    const fromTime = chapter.time ? extractVideoBookmarks(`${chapter.time} ${label}`)[0] : undefined;
    const seconds =
      fromTime?.seconds ??
      (typeof chapter.seconds === 'number' && Number.isFinite(chapter.seconds)
        ? Math.max(0, Math.trunc(chapter.seconds))
        : 0);
    out.push({
      id: `bm-${seconds}-${label.slice(0, 12).replace(/\s+/g, '-').toLowerCase()}`,
      label,
      seconds,
    });
  }
  return out.sort((a, b) => a.seconds - b.seconds);
}

function resolvePatternBookmarks(
  video: YouTubeVideoItem,
  ai: AiPatternPayload,
  totalRows: number,
  keyStitches: string[],
  durationSeconds: number,
): VideoBookmark[] {
  const description = video.snippet?.description ?? '';
  let bookmarks = extractVideoBookmarks(description);
  if (bookmarks.length === 0) {
    bookmarks = extractVideoBookmarks(ai.description ?? '');
  }
  if (bookmarks.length === 0) {
    bookmarks = bookmarksFromAiChapters(ai.chapters);
  }
  return bookmarks;
}

export function mergePattern(
  video: YouTubeVideoItem,
  ai: AiPatternPayload,
): SeedPattern {
  const videoId = video.id ?? '';
  const title = (video.snippet?.title ?? 'Untitled tutorial').trim();
  const author = (video.snippet?.channelTitle ?? 'Unknown').trim();
  const hookFromTools =
    ai.tools?.find((tool) => /hook/i.test(tool.type ?? ''))?.size?.trim() ?? ai.hookSize?.trim() ?? '5.0 mm';

  const materials = (ai.materials ?? [])
    .map((item) => ({
      name: String(item.name ?? '').trim(),
      weight: String(item.weight ?? '').trim(),
      yardage: String(item.yardage ?? '').trim(),
    }))
    .filter((item) => item.name.length > 0);

  const tools = (ai.tools ?? [])
    .map((item) => ({
      type: String(item.type ?? '').trim(),
      size: String(item.size ?? '').trim(),
    }))
    .filter((item) => item.type.length > 0);

  const keyStitches = (ai.keyStitches ?? [])
    .map((stitch) => String(stitch).trim())
    .filter((stitch) => stitch.length > 0);

  const yarnFromMaterials = materials[0]?.weight;
  const estimatedMinutes = clampInt(ai.estimatedTimeMinutes ?? 120, 15, 24 * 60);

  const categoryKeywords: Record<string, string[]> = {
    amigurumi: ['amigurumi', 'plush', 'plushie', 'doll', 'stuffie', 'toy'],
    wearables: [
      'wearable',
      'wearables',
      'cardigan',
      'sweater',
      'jumper',
      'pullover',
      'hat',
      'beanie',
      'scarf',
      'shawl',
      'duster',
      'sock',
      'glove',
      'mitten',
      'cowl',
      'vest',
      'hoodie',
      'dress',
    ],
    halloween: ['halloween', 'pumpkin', 'spooky', 'ghost', 'bat', 'witch', 'skull', 'spider', 'autumn', 'october'],
    blanket: ['blanket', 'afghan', 'throw'],
    bag: ['bag', 'tote', 'purse', 'pouch'],
  };

  const textToScan = `${title} ${video.snippet?.description ?? ''}`.toLowerCase();
  const inferredCategories = Object.entries(categoryKeywords)
    .filter(([, keywords]) => keywords.some((kw) => textToScan.includes(kw)))
    .map(([category]) => category);

  const rawTags = [
    ...(ai.tags ?? []),
    ...inferredCategories,
    ...keyStitches,
  ];
  const tags: string[] = [];
  for (const tag of rawTags) {
    const normalized = String(tag).trim().toLowerCase();
    if (normalized && !tags.includes(normalized)) {
      tags.push(normalized);
    }
  }

  const totalRows = clampInt(ai.totalRows ?? Math.round(estimatedMinutes / 12), 1, 9999);
  const stitchesPerRow = clampInt(ai.stitchesPerRow ?? 36, 1, 9999);
  const bookmarks = resolvePatternBookmarks(
    video,
    ai,
    totalRows,
    keyStitches,
    estimatedMinutes * 60,
  );

  return {
    id: slugifyId(title, videoId),
    videoId,
    youtubeUrl: youtubeWatchUrl(videoId),
    thumbnailUrl: thumbnailUrl(videoId),
    title,
    author,
    difficulty: normalizeDifficulty(ai.difficulty),
    estimatedTimeMinutes: estimatedMinutes,
    description: (ai.description ?? '').trim() || 'Crochet tutorial from YouTube.',
    materials,
    tools,
    keyStitches,
    yarnWeight: normalizeYarnWeight(ai.yarnWeight ?? yarnFromMaterials),
    hookSize: hookFromTools,
    totalRows,
    stitchesPerRow,
    tags: tags.slice(0, 8),
    bookmarks,
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
    const existingIds = readExistingVideoIds(seedSource);

    logTimestamp(
      `YouTube fetch starting (topic: ${SEARCH_TOPIC}, batch: ${BATCH_SIZE}, catalog: ${existingIds.size})…`,
    );
    const videos = await getTrendingVideos(youtubeKey, existingIds);
    if (videos.length === 0) {
      logTimestamp(
        `Added 0 new patterns. Catalog now has total of ${existingIds.size} patterns.`,
      );
      return;
    }
    logTimestamp(`YouTube fetch finished (${videos.length} new videos)`);

    const { client, model } = buildAiClient(isLocal);

    logTimestamp(`AI batch extraction starting (${videos.length} videos, model: ${model})…`);
    const aiStartedAt = Date.now();
    const batch = await extractBatchPatterns(client, model, videos);
    const aiElapsedSeconds = ((Date.now() - aiStartedAt) / 1000).toFixed(1);
    logTimestamp(
      `AI batch extraction finished in ${aiElapsedSeconds}s (${batch.length} pattern objects)`,
    );

    const seen = new Set(existingIds);
    const patterns = withUniquePatternIds(
      mapBatchPatternsToSeed(videos, batch).filter((pattern) => {
        if (!pattern.videoId || seen.has(pattern.videoId)) return false;
        seen.add(pattern.videoId);
        return true;
      }),
      seedSource,
    );

    logTimestamp('Appending new patterns to store/seed.ts…');
    const nextSource = appendSeedPatterns(seedSource, patterns);
    fs.writeFileSync(SEED_FILE, nextSource, 'utf8');
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
