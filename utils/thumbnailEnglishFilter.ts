import type OpenAI from 'openai';
import { isGeminiRateLimitError, waitForGeminiRequest } from './geminiRequestPacing';

/** Max thumbnails per vision request (`gemini-flash-lite` rejects large batches). */
export const THUMBNAIL_VISION_CHUNK_SIZE = 4;

export function youtubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
}

/** Stable size for vision APIs (maxresdefault often 404s and breaks multimodal requests). */
export function youtubeThumbnailUrlForVision(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

type ThumbnailScreenRow = {
  index?: number;
  reject?: boolean;
};

type ThumbnailScreenPayload = {
  results?: ThumbnailScreenRow[];
};

export function parseThumbnailScreenPayload(raw: string): Map<number, boolean> {
  const parsed = JSON.parse(raw) as ThumbnailScreenPayload;
  const rejectByIndex = new Map<number, boolean>();
  for (const row of parsed.results ?? []) {
    if (typeof row.index !== 'number' || row.index < 0) continue;
    rejectByIndex.set(row.index, Boolean(row.reject));
  }
  return rejectByIndex;
}

/** Shared Gemini vision rubric for scraper + seed thumbnail pruning. */
export function thumbnailFeedVisionPrompt(imageCount: number): string {
  return [
    `You will see ${imageCount} YouTube video thumbnail images, labeled Image 0 through Image ${imageCount - 1}.`,
    'For each image, decide whether to REJECT it for a polished English crochet pattern feed.',
    'REJECT if the thumbnail shows ANY readable non-English text (one word is enough),',
    'including large Hindi/Devanagari headlines, CJK, Cyrillic, or Arabic overlays.',
    'REJECT knitting promos with Hindi/foreign thumbnail text even if metadata is English.',
    'REJECT when the photo is ONLY materials: yarn skeins or balls with hooks/props but NO finished crochet piece,',
    'NO stitch swatch texture, and NO close-up of hands working visible stitch fabric.',
    'REJECT flat product-style yarn pack shots even if a hook is tucked into the skein.',
    'KEEP when you see a finished project (blanket, garment, amigurumi, bag, runner),',
    'a clear stitch pattern close-up, or hands crocheting with visible loops/stitches.',
    'KEEP when on-image text is absent or clearly English-only (e.g. CROCHET, DIY, tutorial).',
    'Ignore tiny corner watermarks unless they contain foreign script.',
    `Return strict JSON only: { "results": [ { "index": 0, "reject": false }, ... ] }`,
    `Include exactly ${imageCount} entries with index 0 through ${imageCount - 1}.`,
  ].join(' ');
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

async function screenThumbnailChunk<T extends { id?: string }>(
  client: OpenAI,
  model: string,
  videos: T[],
): Promise<Set<number>> {
  const rejectIndices = new Set<number>();

  const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    {
      type: 'text',
      text: thumbnailFeedVisionPrompt(videos.length),
    },
  ];

  for (let index = 0; index < videos.length; index += 1) {
    const videoId = videos[index]?.id ?? '';
    content.push({ type: 'text', text: `Image ${index}:` });
    content.push({
      type: 'image_url',
      image_url: { url: youtubeThumbnailUrlForVision(videoId) },
    });
  }

  await waitForGeminiRequest();
  const completion = await client.chat.completions.create(
    {
      model,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content }],
    },
    { timeout: 90_000 },
  );

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new Error('Thumbnail screen returned an empty response');
  }

  const rejectByIndex = parseThumbnailScreenPayload(raw);
  for (let index = 0; index < videos.length; index += 1) {
    if (rejectByIndex.get(index)) rejectIndices.add(index);
  }
  return rejectIndices;
}

async function collectRejectedThumbnailIndices<T extends { id?: string }>(
  client: OpenAI,
  model: string,
  videos: T[],
): Promise<Set<number>> {
  const rejectedGlobal = new Set<number>();
  const chunks = chunk(videos, THUMBNAIL_VISION_CHUNK_SIZE);

  for (const [chunkOffset, videoChunk] of chunks.entries()) {
    const baseIndex = chunkOffset * THUMBNAIL_VISION_CHUNK_SIZE;
    try {
      const rejectedInChunk = await screenThumbnailChunk(client, model, videoChunk);
      for (const localIndex of rejectedInChunk) {
        rejectedGlobal.add(baseIndex + localIndex);
      }
    } catch (error) {
      if (isGeminiRateLimitError(error)) throw error;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `[thumbnailEnglishFilter] chunk ${chunkOffset + 1}/${chunks.length} failed (${message}); retrying one-by-one`,
      );
      for (let localIndex = 0; localIndex < videoChunk.length; localIndex += 1) {
        const single = videoChunk[localIndex];
        if (!single) continue;
        try {
          const rejectedOne = await screenThumbnailChunk(client, model, [single]);
          if (rejectedOne.has(0)) {
            rejectedGlobal.add(baseIndex + localIndex);
          }
        } catch (singleError) {
          if (isGeminiRateLimitError(singleError)) throw singleError;
          const singleMessage =
            singleError instanceof Error ? singleError.message : String(singleError);
          console.warn(
            `[thumbnailEnglishFilter] skipped video ${single.id ?? '?'} after vision error: ${singleMessage}`,
          );
        }
      }
    }
  }

  return rejectedGlobal;
}

/** Splits videos by thumbnail visible text (vision). Failed chunks are kept. */
export async function partitionVideosByEnglishThumbnailText<T extends { id?: string }>(
  client: OpenAI,
  model: string,
  videos: T[],
): Promise<{ kept: T[]; rejected: T[] }> {
  if (videos.length === 0) return { kept: [], rejected: [] };

  const rejectedGlobal = await collectRejectedThumbnailIndices(client, model, videos);
  const kept: T[] = [];
  const rejected: T[] = [];
  for (let index = 0; index < videos.length; index += 1) {
    const video = videos[index]!;
    if (rejectedGlobal.has(index)) rejected.push(video);
    else kept.push(video);
  }
  return { kept, rejected };
}

/**
 * Drops videos whose thumbnails fail feed quality (foreign on-image text, yarn-only shots).
 * Requires a vision-capable model (Gemini cloud). On chunk failure, keeps that chunk.
 */
export async function filterVideosByEnglishThumbnailText<T extends { id?: string }>(
  client: OpenAI,
  model: string,
  videos: T[],
): Promise<T[]> {
  const { kept } = await partitionVideosByEnglishThumbnailText(client, model, videos);
  return kept;
}
