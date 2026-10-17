/**
 * Gemini field rules shared by the catalog scraper and the in-app YouTube upload.
 *
 * Title and creator stay on the YouTube snippet. The model fills difficulty,
 * yarn, hook, counts, tags, summary, and chapters. Upload also asks for an
 * explicit crochet verdict because a pasted link is not limited to crochet search.
 */
import {
  extractVideoBookmarks,
  formatBookmarkTime,
  resolveVideoBookmarksFromSources,
  type VideoBookmark,
} from '@/utils/chapters';
import { scrapeCategoryKeywords } from '@/utils/holidayTopics';
import { derivePatternSummary } from '@/utils/patternSummary';

export const CROCHET_ACCEPT_CONFIDENCE = 80;

const YARN_WEIGHTS = [
  'lace',
  'fingering',
  'sport',
  'dk',
  'worsted',
  'aran',
  'bulky',
  'super-bulky',
  'jumbo',
] as const;

export type ExtractedYarnWeight = (typeof YARN_WEIGHTS)[number];
export type ExtractedDifficulty = 'beginner' | 'easy' | 'intermediate' | 'advanced';

export type ExtractedPatternAi = {
  isValidCrochet?: boolean;
  confidence?: number;
  rejectionReason?: string | null;
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
  steps?: string[];
};

export type PatternVideoFacts = {
  title: string;
  creator: string;
  description: string;
};

export type MappedPatternDetails = {
  title: string;
  creator: string;
  difficulty: ExtractedDifficulty;
  yarnWeight: ExtractedYarnWeight;
  hookSize: string;
  totalRows: number;
  stitchesPerRow: number;
  tags: string[];
  summary: string;
  description: string;
  estimatedTimeMinutes: number;
  materials: { name: string; weight: string; yardage: string }[];
  tools: { type: string; size: string }[];
  keyStitches: string[];
  bookmarks: VideoBookmark[];
  steps: string[];
};

const FIELD_RULES = [
  'difficulty (Beginner|Easy|Intermediate|Advanced), estimatedTimeMinutes,',
  'summary (1–2 sentences, max 160 characters, enticing maker-focused blurb for the detail screen),',
  'description (longer project overview, 2–4 sentences),',
  'materials [{ name, weight, yardage }], tools [{ type, size }], keyStitches [string],',
  'yarnWeight (lace|fingering|sport|dk|worsted|aran|bulky|super-bulky|jumbo), hookSize,',
  'totalRows, stitchesPerRow,',
  'tags [string] (include relevant category tags such as amigurumi, wearables, halloween, christmas, valentines, thanksgiving, easter, blanket, bag alongside key stitches),',
  'chapters [{ label, time }] when the description lists timestamps (time as M:SS or H:MM:SS).',
  'When a transcript excerpt is present, use it as the primary signal for difficulty, keyStitches, tags, and time estimate.',
  'Difficulty rubric: Beginner = magic ring/chaining/SC only, no shaping; Easy = simple repeats and basic increases/decreases;',
  'Intermediate = colorwork, notable shaping, or many parts to assemble; Advanced = garments, fine lace, complex construction, or many techniques.',
  'Tags: lowercase, specific (project type + notable stitches + season when relevant), 4–8 items, no duplicates.',
].join(' ');

/** System prompt for the catalog scraper's batch call. Wording stays aligned with upload. */
export function batchExtractionSystemPrompt(videoCount: number): string {
  return [
    `Analyze these ${videoCount} crochet YouTube videos and extract project details for each.`,
    'Return strict JSON only: { "patterns": [ ... ] }.',
    'Each item must include videoIndex (0-based, matching Video N in the user message),',
    FIELD_RULES,
    `Include exactly ${videoCount} entries with videoIndex 0 through ${videoCount - 1}.`,
    'Infer reasonable values when a video omits them.',
  ].join(' ');
}

/** Prompt for one pasted tutorial, including the crochet verdict the scraper search does not need. */
export function youtubeUploadExtractionPrompt(tutorial: string): string {
  return [
    'Review this one YouTube tutorial and extract project details.',
    'Set isValidCrochet true only for a crochet tutorial. Knitting, spam, ads, and unrelated videos are false.',
    'confidence is an integer from 0 to 100. rejectionReason is null when it is valid crochet.',
    'steps are crochet stitch lines, at most 16.',
    FIELD_RULES,
    'Infer reasonable values when the video omits them.',
    'Tutorial:',
    tutorial,
  ].join('\n');
}

export function formatTutorialForPrompt(input: {
  title: string;
  description: string;
  transcript?: string | null;
}): string {
  const transcript = input.transcript?.trim();
  const transcriptBlock = transcript
    ? `\nTranscript excerpt (spoken tutorial — prefer for difficulty, stitches, and tags):\n${transcript}`
    : '\nTranscript: (not available — use title and description only)';
  return `Title: ${input.title.trim()}\nDescription:\n${input.description.trim()}${transcriptBlock}`;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === 'string');
}

function asRecords(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
}

/** Reads a Firebase or scraper JSON object into the shared payload. */
export function readExtractedPatternAi(value: unknown): ExtractedPatternAi | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record.isValidCrochet !== 'boolean') return null;
  if (typeof record.confidence !== 'number' || !Number.isFinite(record.confidence)) return null;
  const confidence = Math.round(record.confidence);
  if (confidence < 0 || confidence > 100) return null;
  const rejection = typeof record.rejectionReason === 'string' ? record.rejectionReason.trim() : '';
  return {
    isValidCrochet: record.isValidCrochet,
    confidence,
    rejectionReason: rejection.length > 0 ? rejection : null,
    difficulty: asString(record.difficulty),
    estimatedTimeMinutes: asNumber(record.estimatedTimeMinutes),
    description: asString(record.description),
    summary: asString(record.summary),
    materials: asRecords(record.materials).map((item) => ({
      name: asString(item.name),
      weight: asString(item.weight),
      yardage: asString(item.yardage),
    })),
    tools: asRecords(record.tools).map((item) => ({
      type: asString(item.type),
      size: asString(item.size),
    })),
    keyStitches: asStringList(record.keyStitches),
    yarnWeight: asString(record.yarnWeight),
    hookSize: asString(record.hookSize),
    totalRows: asNumber(record.totalRows),
    stitchesPerRow: asNumber(record.stitchesPerRow),
    tags: asStringList(record.tags),
    chapters: asRecords(record.chapters).map((item) => ({
      label: asString(item.label),
      time: asString(item.time),
      seconds: asNumber(item.seconds),
    })),
    steps: asStringList(record.steps),
  };
}

/** High-confidence crochet only. Missing or low confidence is a reject. */
export function acceptsCrochetExtraction(
  value: { isValidCrochet?: boolean; confidence?: number } | null | undefined,
): boolean {
  if (!value?.isValidCrochet) return false;
  return typeof value.confidence === 'number' && value.confidence >= CROCHET_ACCEPT_CONFIDENCE;
}

export function normalizeExtractedDifficulty(value: string | undefined): ExtractedDifficulty {
  const key = (value ?? '').trim().toLowerCase();
  if (key === 'beginner' || key === 'easy' || key === 'intermediate' || key === 'advanced') {
    return key;
  }
  return 'easy';
}

export function normalizeExtractedYarnWeight(value: string | undefined): ExtractedYarnWeight {
  const raw = (value ?? '').trim().toLowerCase().replace(/\s+/g, '-');
  const aliases: Record<string, ExtractedYarnWeight> = {
    '4-ply': 'sport',
    '5-ply': 'sport',
    '8-ply': 'dk',
    '10-ply': 'aran',
    chunky: 'bulky',
    'super-chunky': 'super-bulky',
  };
  const candidate = aliases[raw] ?? raw;
  if ((YARN_WEIGHTS as readonly string[]).includes(candidate)) {
    return candidate as ExtractedYarnWeight;
  }
  return 'worsted';
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function bookmarksFromAiChapters(chapters: ExtractedPatternAi['chapters']): VideoBookmark[] {
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

function stepsFromExtraction(
  ai: ExtractedPatternAi,
  bookmarks: readonly VideoBookmark[],
  description: string,
): string[] {
  const fromModel = (ai.steps ?? [])
    .map((step) => String(step).replace(/\s+/g, ' ').trim())
    .filter((step) => step.length > 0)
    .slice(0, 16);
  if (fromModel.length > 0) return fromModel;
  if (bookmarks.length > 0) {
    return bookmarks.slice(0, 16).map((bookmark) => `${formatBookmarkTime(bookmark.seconds)} ${bookmark.label}`);
  }
  const sentence = description.replace(/\s+/g, ' ').trim().slice(0, 180);
  return sentence ? [sentence] : [];
}

/** Maps a model payload onto the same pattern fields the scraper writes into the catalog. */
export function mapExtractedPattern(
  video: PatternVideoFacts,
  ai: ExtractedPatternAi,
  watchBookmarks: readonly VideoBookmark[] = [],
): MappedPatternDetails {
  const title = video.title.trim() || 'Untitled tutorial';
  const creator = video.creator.trim() || 'Unknown';
  const descriptionText = video.description ?? '';
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

  const estimatedTimeMinutes = clampInt(ai.estimatedTimeMinutes ?? 120, 15, 24 * 60);
  const overview = (ai.description ?? '').trim() || 'Crochet tutorial from YouTube.';
  const categoryKeywords = scrapeCategoryKeywords();
  const textToScan = `${title} ${descriptionText}`.toLowerCase();
  const inferredCategories = Object.entries(categoryKeywords)
    .filter(([, keywords]) => keywords.some((keyword) => textToScan.includes(keyword)))
    .map(([category]) => category);

  const tags: string[] = [];
  for (const tag of [...(ai.tags ?? []), ...inferredCategories, ...keyStitches]) {
    const normalized = String(tag).trim().toLowerCase();
    if (normalized && !tags.includes(normalized)) tags.push(normalized);
  }

  const bookmarks = resolveVideoBookmarksFromSources(
    extractVideoBookmarks(descriptionText),
    watchBookmarks,
    extractVideoBookmarks(ai.description ?? ''),
    bookmarksFromAiChapters(ai.chapters),
  );

  return {
    title,
    creator,
    difficulty: normalizeExtractedDifficulty(ai.difficulty),
    yarnWeight: normalizeExtractedYarnWeight(ai.yarnWeight ?? materials[0]?.weight),
    hookSize: hookFromTools,
    totalRows: clampInt(ai.totalRows ?? Math.round(estimatedTimeMinutes / 12), 1, 9999),
    stitchesPerRow: clampInt(ai.stitchesPerRow ?? 36, 1, 9999),
    tags: tags.slice(0, 8),
    summary: (ai.summary ?? '').trim() || derivePatternSummary(overview),
    description: overview,
    estimatedTimeMinutes,
    materials,
    tools,
    keyStitches,
    bookmarks,
    steps: stepsFromExtraction(ai, bookmarks, overview),
  };
}
