/**
 * Fetches trending crochet tutorials from YouTube, enriches them with Gemini,
 * and rewrites `SEED_PATTERNS` in store/seed.ts.
 *
 * Run: npx ts-node --project tsconfig.scripts.json scripts/update-patterns.ts
 * Or:  npm run update-patterns
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

const YOUTUBE_SEARCH_QUERY = '"crochet tutorial"|pattern';
const YOUTUBE_SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';
const YOUTUBE_VIDEOS_URL = 'https://www.googleapis.com/youtube/v3/videos';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/';
const GEMINI_MODEL = 'gemini-2.5-flash';

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

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name} in .env`);
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

async function fetchJson<T>(url: string, params: Record<string, string>): Promise<T> {
  const query = new URLSearchParams(params);
  const response = await fetch(`${url}?${query.toString()}`);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`YouTube API ${response.status}: ${body.slice(0, 400)}`);
  }
  return (await response.json()) as T;
}

export async function fetchTrendingCrochetVideos(apiKey: string, limit = 5): Promise<YouTubeVideoItem[]> {
  const search = await fetchJson<{ items?: YouTubeSearchItem[] }>(YOUTUBE_SEARCH_URL, {
    part: 'snippet',
    type: 'video',
    q: YOUTUBE_SEARCH_QUERY,
    order: 'viewCount',
    publishedAfter: publishedAfterIso(7),
    maxResults: '25',
    key: apiKey,
  });

  const ids = (search.items ?? [])
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
    .slice()
    .sort((a, b) => Number(b.statistics?.viewCount ?? 0) - Number(a.statistics?.viewCount ?? 0))
    .slice(0, limit);
}

function buildGeminiClient(apiKey: string): OpenAI {
  return new OpenAI({
    apiKey,
    baseURL: GEMINI_BASE_URL,
  });
}

export async function extractPatternMetadata(
  client: OpenAI,
  title: string,
  description: string,
): Promise<AiPatternPayload> {
  const completion = await client.chat.completions.create({
    model: GEMINI_MODEL,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: [
          'You extract structured crochet pattern metadata from YouTube video text.',
          'Return JSON only with keys:',
          'difficulty (Beginner|Easy|Intermediate|Advanced),',
          'estimatedTimeMinutes (number),',
          'description (1-3 sentences),',
          'materials (array of { name, weight, yardage }),',
          'tools (array of { type, size }),',
          'keyStitches (array of stitch names),',
          'yarnWeight (one of: lace, fingering, sport, dk, worsted, aran, bulky, super-bulky, jumbo),',
          'hookSize (e.g. "5.0 mm"),',
          'totalRows (positive integer guess for project rows),',
          'stitchesPerRow (positive integer guess),',
          'tags (up to 6 short lowercase tags).',
          'Infer reasonable values when the video omits them.',
        ].join(' '),
      },
      {
        role: 'user',
        content: `Title:\n${title}\n\nDescription:\n${description.slice(0, 12_000)}`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new Error('Gemini returned an empty response');
  }

  return JSON.parse(raw) as AiPatternPayload;
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
      name: (item.name ?? '').trim(),
      weight: (item.weight ?? '').trim(),
      yardage: (item.yardage ?? '').trim(),
    }))
    .filter((item) => item.name.length > 0);

  const tools = (ai.tools ?? [])
    .map((item) => ({
      type: (item.type ?? '').trim(),
      size: (item.size ?? '').trim(),
    }))
    .filter((item) => item.type.length > 0);

  const keyStitches = (ai.keyStitches ?? [])
    .map((stitch) => stitch.trim())
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
  const youtubeKey = requireEnv('YOUTUBE_API_KEY');
  const geminiKey = requireEnv('GEMINI_API_KEY');

  const videos = await fetchTrendingCrochetVideos(youtubeKey, 5);
  if (videos.length === 0) {
    throw new Error('No crochet tutorial videos found for the last 7 days');
  }

  const client = buildGeminiClient(geminiKey);
  const patterns: SeedPattern[] = [];

  for (const video of videos) {
    const title = video.snippet?.title ?? '';
    const description = video.snippet?.description ?? '';
    const ai = await extractPatternMetadata(client, title, description);
    patterns.push(mergePattern(video, ai));
  }

  const seedSource = fs.readFileSync(SEED_FILE, 'utf8');
  const nextSource = replaceSeedPatternsBlock(seedSource, formatSeedPatternsExport(patterns));
  fs.writeFileSync(SEED_FILE, nextSource, 'utf8');

  console.log(`Updated ${patterns.length} seed patterns in store/seed.ts`);
  for (const pattern of patterns) {
    console.log(`  • ${pattern.title} (${pattern.youtubeUrl})`);
  }
}

const isDirectRun = require.main === module;
if (isDirectRun) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
