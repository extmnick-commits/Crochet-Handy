/**
 * Reads a pasted tutorial link and returns the pattern fields to save.
 * YouTube goes through the same Gemini extraction as the catalog scraper.
 * The sheet only shows a link and the logo animation.
 */
import type { NewPatternInput } from '@/store/machine';
import { submitCommunityPattern } from '@/utils/communitySubmission';
import { isFirebaseConfigured } from '@/utils/firebase';
import { detectPatternVideo, extractYoutubePattern, type PatternVideoSource } from '@/utils/patternAiParser';
import { acceptsCrochetExtraction, mapExtractedPattern } from '@/utils/patternExtraction';
import { PREFILTER_REJECTION_MESSAGE } from '@/utils/crochetReview';
import { uploadYoutubeSnippetRejection, type UploadSnippetRejection } from '@/utils/patternEnglishFilter';
import { fetchYouTubeVideoDetails, youtubeChaptersConfigured, type YouTubeVideoDetails } from '@/utils/youtubeChapters';
import { fetchYoutubeTranscriptExcerpt } from '@/utils/youtubeTranscript';

export type TutorialCommunityShare = {
  title: string;
  steps: string[];
  hookSize: string;
  yarnWeight: string;
  source: PatternVideoSource;
  videoUrl: string;
  rawText: string;
  acceptedExtraction: {
    title: string;
    steps: string[];
    hookSize: string;
    yarnWeight: string;
    confidence: number;
  };
};

export type PreparedTutorial =
  | { ok: false; message: string }
  | { ok: true; input: NewPatternInput; community: TutorialCommunityShare | null };

export async function prepareTutorialImport(url: string): Promise<PreparedTutorial> {
  const detected = detectPatternVideo({ url });
  if (!detected) return { ok: false, message: 'Paste a YouTube, Facebook, or web tutorial link.' };

  if (detected.source !== 'youtube') {
    const title = detected.source === 'facebook' ? 'Facebook tutorial' : 'Web tutorial';
    return {
      ok: true,
      community: null,
      input: {
        title,
        youtubeUrl: detected.youtubeUrl || detected.videoUrl,
        videoUrl: detected.videoUrl,
        source: detected.source,
        yarnWeight: 'worsted',
        totalRows: 10,
        stitchesPerRow: 10,
        difficulty: 'easy',
        steps: ['Watch the tutorial.'],
      },
    };
  }

  if (!youtubeChaptersConfigured()) {
    return { ok: false, message: 'Could not read that YouTube video.' };
  }
  const details = await fetchYouTubeVideoDetails(detected.videoId);
  if (!details) return { ok: false, message: 'Could not read that YouTube video.' };

  const gate = uploadYoutubeSnippetRejection(details);
  if (gate) return { ok: false, message: uploadGateMessage(gate) };
  if (!isFirebaseConfigured()) return { ok: false, message: 'Could not read that tutorial right now.' };

  const transcript = await fetchYoutubeTranscriptExcerpt(detected.videoId);
  const attempt = await extractYoutubePattern({
    title: details.title,
    creator: details.channelTitle,
    description: details.description,
    transcript,
    bookmarks: details.bookmarks,
  });
  if (!attempt.called || !attempt.extraction) {
    return patternFromYoutubeDetails(details, detected.videoUrl, detected.youtubeUrl);
  }
  if (!acceptsCrochetExtraction(attempt.extraction)) {
    return { ok: false, message: attempt.extraction.rejectionReason || PREFILTER_REJECTION_MESSAGE };
  }

  const mapped = attempt.extraction.mapped;
  const steps = mapped.steps;
  const hookSize = mapped.hookSize.trim();
  const input: NewPatternInput = {
    title: mapped.title,
    creator: mapped.creator,
    youtubeUrl: detected.youtubeUrl || detected.videoUrl,
    videoUrl: detected.videoUrl,
    source: 'youtube',
    yarnWeight: mapped.yarnWeight,
    hookSize,
    totalRows: mapped.totalRows,
    stitchesPerRow: mapped.stitchesPerRow,
    difficulty: mapped.difficulty,
    tags: mapped.tags,
    summary: mapped.summary,
    bookmarks: mapped.bookmarks.length > 0 ? mapped.bookmarks : details.bookmarks,
    steps,
  };
  const rawText = [mapped.title, mapped.summary, hookSize, ...steps].filter(Boolean).join('\n');
  return {
    ok: true,
    input,
    community: {
      title: mapped.title,
      steps,
      hookSize,
      yarnWeight: mapped.yarnWeight,
      source: 'youtube',
      videoUrl: detected.videoUrl,
      rawText,
      acceptedExtraction: {
        title: mapped.title,
        steps,
        hookSize,
        yarnWeight: mapped.yarnWeight,
        confidence: attempt.extraction.confidence,
      },
    },
  };
}

/** Saves a prepared tutorial and relays an accepted YouTube pattern to the community catalog. */
export async function publishPreparedTutorial(community: TutorialCommunityShare | null): Promise<void> {
  if (!community || !isFirebaseConfigured()) return;
  try {
    await submitCommunityPattern(community);
  } catch {
    // The pattern is already in the local library. A failed relay stays anonymous.
  }
}

const CROCHET_TITLE = /\bcrochet(?:ing|er|s)?\b|\bamigurumi\b/i;

/**
 * Used when Firebase AI Logic cannot answer. Title, channel, chapters, and any
 * hook size in the description still fill the pattern. Community publish waits
 * for a Gemini verdict.
 */
function patternFromYoutubeDetails(
  details: YouTubeVideoDetails,
  videoUrl: string,
  youtubeUrl: string,
): PreparedTutorial {
  if (!CROCHET_TITLE.test(details.title)) {
    return { ok: false, message: PREFILTER_REJECTION_MESSAGE };
  }
  const hook = details.description.match(/(\d+(?:\.\d+)?)\s*mm/i);
  const beginner = /\b(?:beginner|easiest|easy)\b/i.test(details.title);
  const mapped = mapExtractedPattern(
    { title: details.title, creator: details.channelTitle, description: details.description },
    {
      difficulty: beginner ? 'beginner' : 'easy',
      hookSize: hook ? `${hook[1]} mm` : undefined,
      tags: beginner ? ['beginner'] : [],
    },
    details.bookmarks,
  );
  return {
    ok: true,
    community: null,
    input: {
      title: mapped.title,
      creator: mapped.creator,
      youtubeUrl: youtubeUrl || videoUrl,
      videoUrl,
      source: 'youtube',
      yarnWeight: mapped.yarnWeight,
      hookSize: mapped.hookSize,
      totalRows: mapped.totalRows,
      stitchesPerRow: mapped.stitchesPerRow,
      difficulty: mapped.difficulty,
      tags: mapped.tags,
      summary: mapped.summary,
      bookmarks: mapped.bookmarks.length > 0 ? mapped.bookmarks : details.bookmarks,
      steps: mapped.steps,
    },
  };
}

function uploadGateMessage(reason: UploadSnippetRejection): string {
  switch (reason) {
    case 'shorts':
      return "Shorts aren't saved as patterns.";
    case 'knitting':
      return 'That looks like a knitting tutorial.';
    case 'language':
      return 'Only English tutorials can be saved.';
    case 'author':
      return "That channel isn't available in the pattern library.";
    default:
      return 'Could not read that YouTube video.';
  }
}
