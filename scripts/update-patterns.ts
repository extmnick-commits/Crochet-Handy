/**
 * Fetches trending crochet tutorials from YouTube, enriches them with Gemini,
 * and rewrites `SEED_PATTERNS` in store/seed.ts.
 *
 * Run: npx ts-node --project tsconfig.scripts.json scripts/update-patterns.ts
 * Or:  npm run update-patterns
 * Local LM Studio: npm run update-patterns -- --local
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import dotenv from 'dotenv';
import OpenAI from 'openai';

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
};

const ROOT = path.resolve(__dirname, '..');
const SEED_FILE = path.join(ROOT, 'store', 'seed.ts');

/** Long-form project tutorials only; API params also block Shorts and non-embeddable videos. */
const YOUTUBE_SEARCH_QUERY =
  '("crochet tutorial" | "crochet pattern") ("step by step" | "full project" | "pattern") -shorts -short';
const YOUTUBE_SEARCH_MAX_RESULTS = 10;
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
};

type AiBatchPatternPayload = AiPatternPayload & {
  videoIndex?: number;
};

type AiBatchPatternsResponse = {
  patterns?: AiBatchPatternPayload[];
};

const BATCH_DESCRIPTION_MAX_CHARS = 450;

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
export async function getTrendingVideos(apiKey: string, limit = 5): Promise<YouTubeVideoItem[]> {
  const search = await fetchJson<{ items?: YouTubeSearchItem[] }>(YOUTUBE_SEARCH_URL, {
    part: 'snippet',
    type: 'video',
    q: YOUTUBE_SEARCH_QUERY,
    videoCategoryId: YOUTUBE_VIDEO_CATEGORY_HOWTO,
    videoDuration: 'medium',
    videoEmbeddable: 'true',
    videoSyndicated: 'true',
    order: 'viewCount',
    publishedAfter: publishedAfterIso(7),
    maxResults: String(YOUTUBE_SEARCH_MAX_RESULTS),
    key: apiKey,
  });

  const ids = (search.items ?? [])
    .filter((item) => !isShortFormTitle(item.snippet?.title ?? ''))
    .map((item) => item.id?.videoId)
    .filter((id): id is string => Boolean(id));

  if (ids.length === 0) {
    return [];
  }

  const details = await fetchJson<{ items?: YouTubeVideoItem[] }>(YOUTUBE_VIDEOS_URL, {
    part: 'snippet,statistics',
    id: ids.join(','),
    key: apiKey,
  });

  return (details.items ?? [])
    .filter((item) => !isShortFormTitle(item.snippet?.title ?? ''))
    .slice()
    .sort((a, b) => Number(b.statistics?.viewCount ?? 0) - Number(a.statistics?.viewCount ?? 0))
    .slice(0, limit);
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
          'Return strict JSON only with a top-level "patterns" array.',
          'Each item must include videoIndex (0-based, matching Video N in the user message),',
          'difficulty (Beginner|Easy|Intermediate|Advanced), estimatedTimeMinutes, description,',
          'materials [{ name, weight, yardage }], tools [{ type, size }], keyStitches [string].',
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
    totalRows: clampInt(ai.totalRows ?? Math.round(estimatedMinutes / 12), 1, 9999),
    stitchesPerRow: clampInt(ai.stitchesPerRow ?? 36, 1, 9999),
    tags: (ai.tags ?? keyStitches.slice(0, 4))
      .map((tag) => tag.trim().toLowerCase())
      .filter((tag) => tag.length > 0)
      .slice(0, 8),
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

function formatTools(tools: SeedPattern['tools'], indent: string): string {
  if (tools.length === 0) return '[]';
  const lines = tools.map(
    (item) =>
      `${indent}  { type: '${escapeString(item.type)}', size: '${escapeString(item.size)}' },`,
  );
  return `[\n${lines.join('\n')}\n${indent}]`;
}

export function formatSeedPatternsExport(patterns: SeedPattern[]): string {
  const body = patterns
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
${indent}},`;
    })
    .join('\n');

  return `${SEED_PATTERNS_START}
export const SEED_PATTERNS: SeedPattern[] = [
${body}
];
${SEED_PATTERNS_END}`;
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

    logTimestamp('YouTube fetch starting…');
    const videos = await getTrendingVideos(youtubeKey, 5);
    if (videos.length === 0) {
      throw new Error('No crochet tutorial videos found for the last 7 days');
    }
    logTimestamp(`YouTube fetch finished (${videos.length} videos)`);

    const { client, model } = buildAiClient(isLocal);

    logTimestamp(`AI batch extraction starting (${videos.length} videos, model: ${model})…`);
    const aiStartedAt = Date.now();
    const batch = await extractBatchPatterns(client, model, videos);
    const aiElapsedSeconds = ((Date.now() - aiStartedAt) / 1000).toFixed(1);
    logTimestamp(
      `AI batch extraction finished in ${aiElapsedSeconds}s (${batch.length} pattern objects)`,
    );

    const patterns = mapBatchPatternsToSeed(videos, batch);

    logTimestamp('Writing store/seed.ts…');
    const seedSource = fs.readFileSync(SEED_FILE, 'utf8');
    const nextSource = replaceSeedPatternsBlock(seedSource, formatSeedPatternsExport(patterns));
    fs.writeFileSync(SEED_FILE, nextSource, 'utf8');
    logTimestamp(`Saved ${patterns.length} patterns to store/seed.ts`);

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
