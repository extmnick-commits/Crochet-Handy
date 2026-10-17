/**
 * Save a YouTube tutorial into the pattern library.
 *
 * The store rejects a second copy of the same video and ignores a link it
 * can't parse, so this sheet checks both before calling `addPatternFromYouTube`.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomSheet } from '@/components/ui/BottomSheet';
import { Colors, FontWeight, Layout, Radius, Spacing, Typography } from '@/constants/BambuTheme';
import {
  useCrochetStore,
  YARN_WEIGHTS,
  type PatternDifficulty,
  type YarnWeight,
} from '@/store/useCrochetStore';
import { extractVideoBookmarks, formatBookmarkTime, mergeVideoBookmarks, type VideoBookmark } from '@/utils/chapters';
import { fetchYouTubeVideoDetails, youtubeChaptersConfigured } from '@/utils/youtubeChapters';
import { fetchYoutubeTranscriptExcerpt } from '@/utils/youtubeTranscript';
import { submitCommunityPattern } from '@/utils/communitySubmission';
import { PREFILTER_REJECTION_MESSAGE, preFilterSubmission } from '@/utils/crochetReview';
import { isFirebaseConfigured } from '@/utils/firebase';
import { detectPatternVideo, extractPatternSteps, extractYoutubePattern } from '@/utils/patternAiParser';
import { acceptsCrochetExtraction, type MappedPatternDetails } from '@/utils/patternExtraction';
import { uploadYoutubeSnippetRejection, type UploadSnippetRejection } from '@/utils/patternEnglishFilter';
import { difficultyLabel, parseWholeCount, yarnWeightMeta } from '@/utils/patternDisplay';
import { youtubeThumbnailUrl } from '@/utils/youtube';

const DIFFICULTIES: PatternDifficulty[] = ['beginner', 'easy', 'intermediate', 'advanced'];

type AddPatternModalProps = {
  visible: boolean;
  onClose: () => void;
  onSaved?: (patternId: string) => void;
};

export function AddPatternModal({ visible, onClose, onSaved }: AddPatternModalProps) {
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      header={
        visible ? (
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text role="heading" aria-level={2} style={styles.title}>
                New pattern
              </Text>
              <Text style={styles.subtitle}>Save a YouTube, Facebook, or web tutorial</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={Layout.hitSlop}
              onPress={onClose}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed, webCursor]}
            >
              <Text style={styles.closeGlyph}>×</Text>
            </Pressable>
          </View>
        ) : null
      }
    >
      {visible ? <AddPatternForm onClose={onClose} onSaved={onSaved} /> : null}
    </BottomSheet>
  );
}

function AddPatternForm({ onClose, onSaved }: { onClose: () => void; onSaved?: (patternId: string) => void }) {
  const addPatternFromYouTube = useCrochetStore((state) => state.addPatternFromYouTube);

  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [creator, setCreator] = useState('');
  const [yarnWeight, setYarnWeight] = useState<YarnWeight>('worsted');
  const [hookSize, setHookSize] = useState('');
  const [totalRows, setTotalRows] = useState('10');
  const [stitchesPerRow, setStitchesPerRow] = useState('10');
  const [difficulty, setDifficulty] = useState<PatternDifficulty>('easy');
  const [tags, setTags] = useState('');
  const [notes, setNotes] = useState('');
  const [patternSummary, setPatternSummary] = useState('');
  const [extractedSteps, setExtractedSteps] = useState<string[]>([]);
  const [accepted, setAccepted] = useState<{ confidence: number } | null>(null);
  const [blockReason, setBlockReason] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedLocally, setSavedLocally] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [youtubeBookmarks, setYoutubeBookmarks] = useState<VideoBookmark[]>([]);
  const [chapterLookup, setChapterLookup] = useState<'idle' | 'loading' | 'reading' | 'ready'>('idle');
  const edited = useRef({
    title: false,
    creator: false,
    yarnWeight: false,
    hookSize: false,
    totalRows: false,
    stitchesPerRow: false,
    difficulty: false,
    tags: false,
  });

  const detected = useMemo(() => detectPatternVideo({ url, text: notes }), [url, notes]);
  const noteBookmarks = useMemo(() => extractVideoBookmarks(notes), [notes]);
  const detectedBookmarks = useMemo(
    () => mergeVideoBookmarks(youtubeBookmarks, noteBookmarks),
    [youtubeBookmarks, noteBookmarks],
  );

  useEffect(() => {
    edited.current = {
      title: false,
      creator: false,
      yarnWeight: false,
      hookSize: false,
      totalRows: false,
      stitchesPerRow: false,
      difficulty: false,
      tags: false,
    };
    setTitle('');
    setCreator('');
    setYarnWeight('worsted');
    setHookSize('');
    setTotalRows('10');
    setStitchesPerRow('10');
    setDifficulty('easy');
    setTags('');
    setPatternSummary('');
    setExtractedSteps([]);
    setAccepted(null);
    setBlockReason(null);
    setError(null);

    if (!detected || detected.source !== 'youtube' || !youtubeChaptersConfigured()) {
      setYoutubeBookmarks([]);
      setChapterLookup(detected ? 'ready' : 'idle');
      return;
    }

    const videoId = detected.videoId;
    let cancelled = false;
    setChapterLookup('loading');
    setYoutubeBookmarks([]);

    void (async () => {
      const details = await fetchYouTubeVideoDetails(videoId);
      if (cancelled) return;
      if (!details) {
        setChapterLookup('ready');
        return;
      }
      setYoutubeBookmarks(details.bookmarks);
      const gate = uploadYoutubeSnippetRejection(details);
      if (gate) {
        setBlockReason(uploadGateMessage(gate));
        setChapterLookup('ready');
        return;
      }
      if (!isFirebaseConfigured()) {
        setChapterLookup('ready');
        return;
      }

      setChapterLookup('reading');
      const transcript = await fetchYoutubeTranscriptExcerpt(videoId);
      if (cancelled) return;
      const attempt = await extractYoutubePattern({
        title: details.title,
        creator: details.channelTitle,
        description: details.description,
        transcript,
        bookmarks: details.bookmarks,
      });
      if (cancelled) return;
      if (!attempt.called || !attempt.extraction) {
        setChapterLookup('ready');
        return;
      }
      if (!acceptsCrochetExtraction(attempt.extraction)) {
        setBlockReason(attempt.extraction.rejectionReason || PREFILTER_REJECTION_MESSAGE);
        setChapterLookup('ready');
        return;
      }
      applyMappedDetails(edited.current, attempt.extraction.mapped, {
        setTitle,
        setCreator,
        setYarnWeight,
        setHookSize,
        setTotalRows,
        setStitchesPerRow,
        setDifficulty,
        setTags,
        setPatternSummary,
        setExtractedSteps,
        setYoutubeBookmarks,
      });
      setAccepted({ confidence: attempt.extraction.confidence });
      setChapterLookup('ready');
    })();

    return () => {
      cancelled = true;
    };
  }, [detected?.source, detected?.videoId]);

  const onSave = async () => {
    if (!detected) {
      setError('Paste a YouTube, Facebook, or web tutorial link.');
      return;
    }
    if (savedLocally) {
      onClose();
      return;
    }
    if (blockReason || chapterLookup === 'loading' || chapterLookup === 'reading' || saving) return;
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('Add a title for this pattern.');
      return;
    }
    const rows = parseWholeCount(totalRows);
    const stitches = parseWholeCount(stitchesPerRow);
    if (rows == null || stitches == null) {
      setError('Rows and stitches need to be whole numbers from 1 to 9999.');
      return;
    }

    const library = useCrochetStore.getState().patterns;
    const alreadySaved = detected.videoId
      ? library.some((pattern) => pattern.videoId === detected.videoId)
      : library.some((pattern) => pattern.videoUrl === detected.videoUrl);
    if (alreadySaved) {
      setError('That video is already in your library.');
      return;
    }

    const steps = extractedSteps.length > 0 ? extractedSteps : stepsForImport(notes, detectedBookmarks, rows, stitches, hookSize);
    const id = addPatternFromYouTube({
      title: trimmedTitle,
      creator: creator.trim() || undefined,
      youtubeUrl: detected.youtubeUrl || detected.videoUrl,
      videoUrl: detected.videoUrl,
      source: detected.source,
      yarnWeight,
      hookSize: hookSize.trim() || undefined,
      totalRows: rows,
      stitchesPerRow: stitches,
      difficulty,
      tags: tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
      summary: patternSummary.trim() || undefined,
      bookmarks: detectedBookmarks,
      steps,
    });

    if (!id) {
      setError('Could not save that pattern.');
      return;
    }

    const rawText = [trimmedTitle, notes.trim(), hookSize.trim(), patternSummary.trim(), ...steps].filter(Boolean).join('\n');
    if (isFirebaseConfigured()) {
      if (!accepted && !preFilterSubmission(rawText).ok) {
        setSavedLocally(true);
        setError(PREFILTER_REJECTION_MESSAGE);
        onSaved?.(id);
        return;
      }

      setSaving(true);
      try {
        const result = await submitCommunityPattern({
          title: trimmedTitle,
          steps,
          hookSize: hookSize.trim(),
          yarnWeight,
          source: detected.source,
          videoUrl: detected.videoUrl,
          rawText,
          ...(accepted
            ? {
                acceptedExtraction: {
                  title: trimmedTitle,
                  steps,
                  hookSize: hookSize.trim(),
                  yarnWeight,
                  confidence: accepted.confidence,
                },
              }
            : {}),
        });
        if (result === 'not-crochet') {
          setSavedLocally(true);
          setError(PREFILTER_REJECTION_MESSAGE);
          onSaved?.(id);
          return;
        }
        if (result === 'rate-limited') {
          setSavedLocally(true);
          setError('You can share up to 5 community patterns every 24 hours.');
          onSaved?.(id);
          return;
        }
      } catch {
        // The pattern is already in the local library. A failed relay stays anonymous.
      } finally {
        setSaving(false);
      }
    }

    onSaved?.(id);
    onClose();
  };

  return (
    <View style={styles.form}>
        <Field label="Tutorial link">
          <TextInput
            value={url}
            onChangeText={(value) => {
              setUrl(value);
              setError(null);
            }}
            placeholder="YouTube, Facebook, or a blog video link"
            placeholderTextColor={Colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            inputMode="url"
            style={styles.input}
          />
        </Field>

        {detected && (
          <View style={styles.preview}>
            {detected.videoId ? (
              <Image
                accessible={false}
                source={{ uri: youtubeThumbnailUrl(detected.videoId, 'hq') }}
                style={styles.previewImage}
              />
            ) : (
              <View style={styles.previewFallback}>
                <Text style={styles.previewKind}>{detected.source === 'facebook' ? 'Facebook' : 'Web'}</Text>
              </View>
            )}
            <Text style={styles.previewCaption}>Link ready</Text>
          </View>
        )}

        {detected ? (
          <Text style={styles.shareCaption}>
            Crochet patterns with stitch instructions are checked once and can go live in the community catalog.
          </Text>
        ) : null}

        {detected?.source === 'youtube' && chapterLookup === 'loading' && (
          <Text style={styles.detectTitle}>Checking YouTube for chapters…</Text>
        )}
        {detected?.source === 'youtube' && chapterLookup === 'reading' && (
          <Text style={styles.detectTitle}>Reading this tutorial…</Text>
        )}
        {detected?.source === 'youtube' && chapterLookup === 'ready' && youtubeChaptersConfigured() && youtubeBookmarks.length === 0 && noteBookmarks.length === 0 && (
          <Text style={styles.lookupEmpty}>No chapter timestamps on this video. Paste them below if the creator listed them in the description.</Text>
        )}

        <Field label="Video description or notes (optional)">
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder={'Paste chapters, like\n02:15 Row 1: Foundation'}
            placeholderTextColor={Colors.textTertiary}
            multiline
            textAlignVertical="top"
            style={[styles.input, styles.notesInput]}
          />
        </Field>

        {detectedBookmarks.length > 0 && (
          <View style={styles.detect} testID="bookmark-detect-preview">
            <Text style={styles.detectTitle}>
              ✓ {detectedBookmarks.length} video bookmark{detectedBookmarks.length === 1 ? '' : 's'}{' '}
              {youtubeBookmarks.length > 0 ? 'from YouTube' : 'auto-detected'}
            </Text>
            <View style={styles.chips}>
              {detectedBookmarks.map((bookmark) => (
                <View key={bookmark.id} style={styles.detectChip} accessibilityLabel={`${formatBookmarkTime(bookmark.seconds)} ${bookmark.label}`}>
                  <Text style={styles.detectTime}>{formatBookmarkTime(bookmark.seconds)}</Text>
                  <Text numberOfLines={1} style={styles.detectLabel}>
                    {bookmark.label}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <Field label="Title">
          <TextInput
            value={title}
            onChangeText={(value) => {
              edited.current.title = true;
              setTitle(value);
              setError(null);
            }}
            placeholder="Little ghost amigurumi"
            placeholderTextColor={Colors.textTertiary}
            style={styles.input}
          />
        </Field>

        <Field label="Creator">
          <TextInput
            value={creator}
            onChangeText={(value) => {
              edited.current.creator = true;
              setCreator(value);
            }}
            placeholder="Channel name"
            placeholderTextColor={Colors.textTertiary}
            style={styles.input}
          />
        </Field>

        <Field label="Yarn weight">
          <View style={styles.chips}>
            {YARN_WEIGHTS.map((weight) => {
              const meta = yarnWeightMeta(weight);
              const selected = weight === yarnWeight;
              return (
                <Pressable
                  key={weight}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    edited.current.yarnWeight = true;
                    setYarnWeight(weight);
                  }}
                  style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.pressed, webCursor]}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                    {meta.label} {meta.number}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Field>

        <Field label="Hook size">
          <TextInput
            value={hookSize}
            onChangeText={(value) => {
              edited.current.hookSize = true;
              setHookSize(value);
            }}
            placeholder="4.0 mm"
            placeholderTextColor={Colors.textTertiary}
            autoCapitalize="none"
            style={styles.input}
          />
        </Field>

        <View style={styles.split}>
          <View style={styles.splitItem}>
            <Field label="Total rows">
              <TextInput
                value={totalRows}
                onChangeText={(value) => {
                  edited.current.totalRows = true;
                  setTotalRows(value);
                }}
                placeholder="10"
                placeholderTextColor={Colors.textTertiary}
                keyboardType="number-pad"
                inputMode="numeric"
                style={styles.input}
              />
            </Field>
          </View>
          <View style={styles.splitItem}>
            <Field label="Stitches per row">
              <TextInput
                value={stitchesPerRow}
                onChangeText={(value) => {
                  edited.current.stitchesPerRow = true;
                  setStitchesPerRow(value);
                }}
                placeholder="10"
                placeholderTextColor={Colors.textTertiary}
                keyboardType="number-pad"
                inputMode="numeric"
                style={styles.input}
              />
            </Field>
          </View>
        </View>

        <Field label="Difficulty">
          <View style={styles.chips}>
            {DIFFICULTIES.map((level) => {
              const selected = level === difficulty;
              return (
                <Pressable
                  key={level}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    edited.current.difficulty = true;
                    setDifficulty(level);
                  }}
                  style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.pressed, webCursor]}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{difficultyLabel(level)}</Text>
                </Pressable>
              );
            })}
          </View>
        </Field>

        <Field label="Tags">
          <TextInput
            value={tags}
            onChangeText={(value) => {
              edited.current.tags = true;
              setTags(value);
            }}
            placeholder="amigurumi, halloween, wearable"
            placeholderTextColor={Colors.textTertiary}
            autoCapitalize="none"
            style={styles.input}
          />
        </Field>

        {(blockReason || error) && (
          <Text accessibilityLiveRegion="polite" style={styles.error}>
            {blockReason || error}
          </Text>
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={savedLocally ? 'Done' : 'Save pattern'}
          accessibilityState={{ disabled: Boolean(blockReason) || chapterLookup === 'loading' || chapterLookup === 'reading' || saving }}
          disabled={Boolean(blockReason) || chapterLookup === 'loading' || chapterLookup === 'reading' || saving}
          testID="add-pattern-save"
          onPress={() => {
            void onSave();
          }}
          style={({ pressed }) => [
            styles.save,
            (Boolean(blockReason) || chapterLookup === 'loading' || chapterLookup === 'reading' || saving) && styles.saveWaiting,
            pressed && styles.pressed,
            webCursor,
          ]}
        >
          <Text style={styles.saveText}>{saving ? 'Saving…' : savedLocally ? 'Done' : 'Save pattern'}</Text>
        </Pressable>
      </View>
  );
}

type EditedFields = {
  title: boolean;
  creator: boolean;
  yarnWeight: boolean;
  hookSize: boolean;
  totalRows: boolean;
  stitchesPerRow: boolean;
  difficulty: boolean;
  tags: boolean;
};

function applyMappedDetails(
  edited: EditedFields,
  mapped: MappedPatternDetails,
  set: {
    setTitle: (value: string) => void;
    setCreator: (value: string) => void;
    setYarnWeight: (value: YarnWeight) => void;
    setHookSize: (value: string) => void;
    setTotalRows: (value: string) => void;
    setStitchesPerRow: (value: string) => void;
    setDifficulty: (value: PatternDifficulty) => void;
    setTags: (value: string) => void;
    setPatternSummary: (value: string) => void;
    setExtractedSteps: (value: string[]) => void;
    setYoutubeBookmarks: (value: VideoBookmark[]) => void;
  },
) {
  if (!edited.title) set.setTitle(mapped.title);
  if (!edited.creator) set.setCreator(mapped.creator);
  if (!edited.yarnWeight) set.setYarnWeight(mapped.yarnWeight);
  if (!edited.hookSize) set.setHookSize(mapped.hookSize);
  if (!edited.totalRows) set.setTotalRows(String(mapped.totalRows));
  if (!edited.stitchesPerRow) set.setStitchesPerRow(String(mapped.stitchesPerRow));
  if (!edited.difficulty) set.setDifficulty(mapped.difficulty);
  if (!edited.tags) set.setTags(mapped.tags.join(', '));
  set.setPatternSummary(mapped.summary);
  set.setExtractedSteps(mapped.steps);
  if (mapped.bookmarks.length > 0) set.setYoutubeBookmarks(mapped.bookmarks);
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

function stepsForImport(
  notes: string,
  bookmarks: VideoBookmark[],
  rows: number,
  stitches: number,
  hookSize: string,
): string[] {
  const parsed = extractPatternSteps(notes);
  if (parsed.length > 0) return parsed;
  if (bookmarks.length > 0) {
    return bookmarks.map((bookmark) => `${formatBookmarkTime(bookmark.seconds)} ${bookmark.label}`);
  }
  const hook = hookSize.trim() || 'the listed hook';
  return [`Work ${rows} rows of ${stitches} stitches with ${hook}.`];
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const webCursor = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : null;

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    paddingHorizontal: Layout.screenGutter,
    paddingBottom: Spacing.sm,
  },
  headerCopy: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...Typography.headline,
    color: Colors.textPrimary,
  },
  subtitle: {
    ...Typography.callout,
    color: Colors.textSecondary,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.elevatedControl,
  },
  closeGlyph: {
    marginTop: -2,
    color: Colors.textPrimary,
    fontSize: 22,
    lineHeight: 24,
    fontWeight: FontWeight.medium,
  },
  form: {
    paddingHorizontal: Layout.screenGutter,
    paddingBottom: Spacing.lg,
    gap: Spacing.lg,
  },
  field: {
    gap: Spacing.xs,
  },
  label: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  input: {
    ...Typography.body,
    color: Colors.textPrimary,
    backgroundColor: Colors.elevatedControl,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Platform.OS === 'ios' ? Spacing.md : Spacing.sm,
    minHeight: 48,
  },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  previewImage: {
    width: 96,
    height: 54,
    borderRadius: Radius.sm,
    backgroundColor: Colors.elevatedControl,
  },
  previewFallback: {
    width: 96,
    height: 54,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.elevatedControl,
  },
  previewKind: {
    ...Typography.caption,
    color: Colors.textPrimary,
    fontWeight: FontWeight.semibold,
  },
  previewCaption: {
    ...Typography.callout,
    color: Colors.accentPrimary,
  },
  shareCaption: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  notesInput: {
    minHeight: 88,
  },
  detect: {
    gap: Spacing.sm,
  },
  detectTitle: {
    ...Typography.callout,
    color: Colors.accentPrimary,
    fontWeight: FontWeight.semibold,
  },
  lookupEmpty: {
    ...Typography.callout,
    color: Colors.textSecondary,
  },
  detectChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    maxWidth: '100%',
    paddingLeft: Spacing.xxs,
    paddingRight: Spacing.sm,
    paddingVertical: Spacing.xxs,
    borderRadius: Radius.pill,
    backgroundColor: Colors.elevatedControl,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  detectTime: {
    ...Typography.caption,
    color: Colors.onAccent,
    fontWeight: FontWeight.bold,
    backgroundColor: Colors.accentPrimary,
    overflow: 'hidden',
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xxs,
  },
  detectLabel: {
    ...Typography.caption,
    flexShrink: 1,
    color: Colors.textPrimary,
    fontWeight: FontWeight.medium,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.pill,
    backgroundColor: Colors.elevatedControl,
    borderWidth: 1,
    borderColor: Colors.transparent,
  },
  chipSelected: {
    backgroundColor: Colors.accentMuted,
    borderColor: Colors.accentPrimary,
  },
  chipText: {
    ...Typography.caption,
    color: Colors.textPrimary,
    fontWeight: FontWeight.semibold,
  },
  chipTextSelected: {
    color: Colors.accentPrimary,
  },
  split: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  splitItem: {
    flex: 1,
  },
  error: {
    ...Typography.callout,
    color: Colors.danger,
  },
  save: {
    minHeight: 48,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accentPrimary,
  },
  saveWaiting: {
    opacity: 0.55,
  },
  saveText: {
    ...Typography.label,
    color: Colors.onAccent,
  },
  pressed: {
    opacity: 0.72,
  },
});
