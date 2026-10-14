/**
 * Save a YouTube tutorial into the pattern library.
 *
 * The store rejects a second copy of the same video and ignores a link it
 * can't parse, so this sheet checks both before calling `addPatternFromYouTube`.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
import { fetchYouTubeChapterBookmarks, youtubeChaptersConfigured } from '@/utils/youtubeChapters';
import { difficultyLabel, parseWholeCount, yarnWeightMeta } from '@/utils/patternDisplay';
import { parseYouTubeUrl, youtubeThumbnailUrl } from '@/utils/youtube';

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
              <Text style={styles.subtitle}>Save a YouTube tutorial to your library</Text>
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
  const [error, setError] = useState<string | null>(null);
  const [youtubeBookmarks, setYoutubeBookmarks] = useState<VideoBookmark[]>([]);
  const [chapterLookup, setChapterLookup] = useState<'idle' | 'loading' | 'ready'>('idle');

  const parsed = parseYouTubeUrl(url);
  const noteBookmarks = useMemo(() => extractVideoBookmarks(notes), [notes]);
  const detectedBookmarks = useMemo(
    () => mergeVideoBookmarks(youtubeBookmarks, noteBookmarks),
    [youtubeBookmarks, noteBookmarks],
  );

  useEffect(() => {
    if (!parsed || !youtubeChaptersConfigured()) {
      setYoutubeBookmarks([]);
      setChapterLookup(parsed ? 'ready' : 'idle');
      return;
    }
    let cancelled = false;
    setChapterLookup('loading');
    setYoutubeBookmarks([]);
    void fetchYouTubeChapterBookmarks([parsed.videoId]).then((found) => {
      if (cancelled) return;
      setYoutubeBookmarks(found.get(parsed.videoId) ?? []);
      setChapterLookup('ready');
    });
    return () => {
      cancelled = true;
    };
  }, [parsed?.videoId]);

  const onSave = () => {
    if (!parsed) {
      setError('Paste a full YouTube link.');
      return;
    }
    if (chapterLookup === 'loading') return;
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('Add a title for this pattern.');
      return;
    }
    const rows = parseWholeCount(totalRows);
    const stitches = parseWholeCount(stitchesPerRow);
    if (rows === null || stitches === null) {
      setError('Rows and stitches need to be whole numbers from 1 to 9999.');
      return;
    }

    const alreadySaved = useCrochetStore.getState().patterns.some((pattern) => pattern.videoId === parsed.videoId);
    if (alreadySaved) {
      setError('That video is already in your library.');
      return;
    }

    const id = addPatternFromYouTube({
      title: trimmedTitle,
      creator: creator.trim() || undefined,
      youtubeUrl: parsed.canonicalUrl,
      yarnWeight,
      hookSize: hookSize.trim() || undefined,
      totalRows: rows,
      stitchesPerRow: stitches,
      difficulty,
      tags: tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
      bookmarks: detectedBookmarks,
    });

    if (!id) {
      setError('Could not save that pattern.');
      return;
    }

    onSaved?.(id);
    onClose();
  };

  return (
    <View style={styles.form}>
        <Field label="YouTube link">
          <TextInput
            value={url}
            onChangeText={(value) => {
              setUrl(value);
              setError(null);
            }}
            placeholder="https://www.youtube.com/watch?v=…"
            placeholderTextColor={Colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            inputMode="url"
            style={styles.input}
          />
        </Field>

        {parsed && (
          <View style={styles.preview}>
            <Image
              accessible={false}
              source={{ uri: youtubeThumbnailUrl(parsed.videoId, 'hq') }}
              style={styles.previewImage}
            />
            <Text style={styles.previewCaption}>Link ready</Text>
          </View>
        )}

        {parsed && chapterLookup === 'loading' && (
          <Text style={styles.detectTitle}>Checking YouTube for chapters…</Text>
        )}
        {parsed && chapterLookup === 'ready' && youtubeChaptersConfigured() && youtubeBookmarks.length === 0 && noteBookmarks.length === 0 && (
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
            onChangeText={setCreator}
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
                  onPress={() => setYarnWeight(weight)}
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
            onChangeText={setHookSize}
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
                onChangeText={setTotalRows}
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
                onChangeText={setStitchesPerRow}
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
                  onPress={() => setDifficulty(level)}
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
            onChangeText={setTags}
            placeholder="amigurumi, halloween, wearable"
            placeholderTextColor={Colors.textTertiary}
            autoCapitalize="none"
            style={styles.input}
          />
        </Field>

        {error && (
          <Text accessibilityLiveRegion="polite" style={styles.error}>
            {error}
          </Text>
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Save pattern"
          accessibilityState={{ disabled: chapterLookup === 'loading' }}
          disabled={chapterLookup === 'loading'}
          testID="add-pattern-save"
          onPress={onSave}
          style={({ pressed }) => [styles.save, chapterLookup === 'loading' && styles.saveWaiting, pressed && styles.pressed, webCursor]}
        >
          <Text style={styles.saveText}>Save pattern</Text>
        </Pressable>
      </View>
  );
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
  previewCaption: {
    ...Typography.callout,
    color: Colors.accentPrimary,
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
