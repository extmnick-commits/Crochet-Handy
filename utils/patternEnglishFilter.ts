/** Leading description window checked for non-English script (title is checked in full). */
export const LEADING_DESCRIPTION_SCRIPT_CHECK_CHARS = 500;

/** Minimum YouTube description length for scraper candidates (seed entries may be shorter). */
export const MIN_YOUTUBE_DESCRIPTION_CHARS = 350;

/** CJK, Cyrillic, Arabic, Devanagari, and related scripts — not Latin crochet pattern text. */
const NON_LATIN_SCRIPT_RE =
  /[\u0400-\u04FF\u0500-\u052F\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\u0900-\u097F\u4E00-\u9FFF\u3400-\u4DBF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF]/g;

/** Channels that routinely use Hindi/foreign thumbnail overlays despite English metadata. */
const BLOCKED_AUTHOR_TOKENS = [
  'knitting works',
  'knithub',
  'crochet knitting time',
] as const;

export function isShortFormTitle(title: string): boolean {
  const lower = title.toLowerCase();
  return lower.includes('#shorts') || lower.includes('#short');
}

/** Knitting-only tutorials (often Hindi/foreign thumbnails) — crochet app feed. */
export function isKnittingFeedTitle(title: string): boolean {
  const lower = title.trim().toLowerCase();
  if (/^knitting\s+pattern\b/.test(lower)) return true;
  if (lower.includes('knitting pattern') && !lower.includes('crochet')) return true;
  return false;
}

export function isBlockedFeedAuthor(author: string): boolean {
  const lower = author.trim().toLowerCase();
  if (!lower) return false;
  return BLOCKED_AUTHOR_TOKENS.some((token) => lower.includes(token));
}

/** Creator names should be plain ASCII (blocks Turkish/CJK channel branding in the feed). */
export function isAsciiEnglishAuthor(author: string): boolean {
  const trimmed = author.trim();
  if (!trimmed) return true;
  return /^[\x20-\x7E]+$/.test(trimmed);
}

function countNonLatinScriptChars(text: string): number {
  return text.match(NON_LATIN_SCRIPT_RE)?.length ?? 0;
}

export function hasSignificantNonLatinScript(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const nonLatin = countNonLatinScriptChars(trimmed);
  if (nonLatin === 0) return false;
  const dense = trimmed.replace(/\s+/g, '').length;
  if (dense === 0) return false;
  return nonLatin >= 3 || nonLatin / dense >= 0.08;
}

export type EnglishPatternTextFields = {
  title: string;
  description?: string;
  author?: string;
};

/** Filters bundled catalog / seed entries (no YouTube language metadata). */
export function isValidEnglishSeedPattern(fields: EnglishPatternTextFields): boolean {
  const title = fields.title.trim();
  const description = (fields.description ?? '').trim();
  const author = plainCreatorName(fields.author ?? '');

  if (isShortFormTitle(title)) return false;
  if (isKnittingFeedTitle(title)) return false;
  if (hasSignificantNonLatinScript(title)) return false;
  if (author.length > 0 && isBlockedFeedAuthor(author)) return false;
  if (author.length > 0 && !isAsciiEnglishAuthor(author)) return false;
  if (author.length > 0 && hasSignificantNonLatinScript(author)) return false;

  const leadingDescription = description.slice(0, LEADING_DESCRIPTION_SCRIPT_CHECK_CHARS);
  if (leadingDescription.length > 0 && hasSignificantNonLatinScript(leadingDescription)) {
    return false;
  }

  return true;
}

export type YoutubeSnippetLike = {
  title?: string;
  description?: string;
  channelTitle?: string;
  defaultAudioLanguage?: string;
  defaultLanguage?: string;
};

export type EnglishFeedPatternFields = {
  title: string;
  creator: string;
  description?: string;
};

export function isEnglishFeedPattern(fields: EnglishFeedPatternFields): boolean {
  return isValidEnglishSeedPattern({
    title: fields.title,
    description: fields.description ?? '',
    author: fields.creator,
  });
}

export type UploadSnippetRejection = 'missing' | 'shorts' | 'knitting' | 'language' | 'author';

/** Drops emoji and decorative marks so a channel like "ElyseCrochets 💌" still counts as English. */
export function plainCreatorName(author: string): string {
  return author.replace(/[^\p{L}\p{N}\s.'’&-]/gu, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Scraper language gates for a tutorial someone pasted.
 * Skips the catalog's minimum description length and ASCII-only channel rule.
 * Emoji in a channel name is decoration, not a foreign-language signal.
 */
export function uploadYoutubeSnippetRejection(snippet: YoutubeSnippetLike | undefined): UploadSnippetRejection | null {
  if (!snippet) return 'missing';
  const title = (snippet.title ?? '').trim();
  const description = (snippet.description ?? '').trim();
  const channelTitle = plainCreatorName(snippet.channelTitle ?? '');
  if (!title) return 'missing';
  if (isShortFormTitle(title)) return 'shorts';
  if (isKnittingFeedTitle(title)) return 'knitting';
  if (hasSignificantNonLatinScript(title)) return 'language';
  if (channelTitle.length > 0 && isBlockedFeedAuthor(channelTitle)) return 'author';
  if (channelTitle.length > 0 && hasSignificantNonLatinScript(channelTitle)) return 'language';
  const leadingDescription = description.slice(0, LEADING_DESCRIPTION_SCRIPT_CHECK_CHARS);
  if (leadingDescription.length > 0 && hasSignificantNonLatinScript(leadingDescription)) return 'language';

  const audioLang = snippet.defaultAudioLanguage?.trim();
  if (audioLang && !audioLang.toLowerCase().startsWith('en')) return 'language';
  const defaultLang = snippet.defaultLanguage?.trim();
  if (defaultLang && !defaultLang.toLowerCase().startsWith('en')) return 'language';
  return null;
}

/** Filters YouTube `videos.list` candidates before AI extraction. */
export function isValidEnglishYoutubeSnippet(snippet: YoutubeSnippetLike | undefined): boolean {
  if (!snippet) return false;

  const title = (snippet.title ?? '').trim();
  const description = (snippet.description ?? '').trim();

  const channelTitle = (snippet.channelTitle ?? '').trim();
  if (!isValidEnglishSeedPattern({ title, description, author: channelTitle })) return false;
  if (description.length < MIN_YOUTUBE_DESCRIPTION_CHARS) return false;

  const audioLang = snippet.defaultAudioLanguage?.trim();
  if (audioLang && !audioLang.toLowerCase().startsWith('en')) return false;

  const defaultLang = snippet.defaultLanguage?.trim();
  if (defaultLang && !defaultLang.toLowerCase().startsWith('en')) return false;

  return true;
}
