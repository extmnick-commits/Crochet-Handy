/**
 * Snapchat-style progress log.
 *
 * A still keeps the project name, row, percent, elapsed time, and hook size
 * frozen on a translucent sticker. The story reel plays those stills in the
 * order they were taken so the piece grows row by row.
 */
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, FontFamily, FontWeight, Radius, Spacing, Typography } from '@/constants/BambuTheme';
import {
  elapsedWholeSeconds,
  formatElapsed,
  rowPercent,
  useCrochetStore,
  type ProgressPhoto,
} from '@/store/useCrochetStore';
import { formatHookMillimeters } from '@/utils/patternDisplay';
import { captureErrorMessage, captureProgressPhoto, type CaptureSource } from '@/utils/progressPhoto';

const STORY_MS = 3200;

type PhotoView = 'log' | 'preview' | 'reel';

type PhotoProgressModalProps = {
  visible: boolean;
  onClose: () => void;
  projectId: string | null;
  /** Still captured by the dashboard camera before this modal opened. */
  incomingUri?: string | null;
  initialView?: PhotoView;
  notice?: string | null;
};

export function PhotoProgressModal({
  visible,
  onClose,
  projectId,
  incomingUri = null,
  initialView = 'log',
  notice = null,
}: PhotoProgressModalProps) {
  const wasVisible = useRef(false);
  const [view, setView] = useState<PhotoView>(initialView);
  const [draftUri, setDraftUri] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [reelStart, setReelStart] = useState(0);

  useEffect(() => {
    if (visible && !wasVisible.current) {
      setDraftUri(incomingUri);
      setView(incomingUri ? 'preview' : initialView);
      setBanner(notice);
      setReelStart(0);
    }
    wasVisible.current = visible;
  }, [visible, incomingUri, initialView, notice]);

  const requestClose = () => {
    if (view === 'preview') {
      setDraftUri(null);
      setView('log');
      return;
    }
    if (view === 'reel' && initialView !== 'reel') {
      setView('log');
      return;
    }
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={requestClose} statusBarTranslucent>
      <View style={styles.screen} testID="photo-progress-modal">
        {view === 'reel' ? (
          <StoryReel projectId={projectId} startIndex={reelStart} onClose={requestClose} />
        ) : view === 'preview' && draftUri ? (
          <PreviewStill
            projectId={projectId}
            uri={draftUri}
            onBack={requestClose}
            onSaved={() => {
              setDraftUri(null);
              setBanner(null);
              setView('log');
            }}
            onRetake={(uri) => setDraftUri(uri)}
            onError={setBanner}
          />
        ) : (
          <ProgressLog
            projectId={projectId}
            banner={banner}
            onClose={onClose}
            onPreview={(uri) => {
              setBanner(null);
              setDraftUri(uri);
              setView('preview');
            }}
            onError={setBanner}
            onWatch={(index) => {
              setReelStart(index);
              setView('reel');
            }}
          />
        )}
      </View>
    </Modal>
  );
}

function ProgressLog({
  projectId,
  banner,
  onClose,
  onPreview,
  onError,
  onWatch,
}: {
  projectId: string | null;
  banner: string | null;
  onClose: () => void;
  onPreview: (uri: string) => void;
  onError: (message: string) => void;
  onWatch: (index: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const project = useCrochetStore((state) => state.projects.find((item) => item.id === projectId) ?? null);
  const progressPhotos = useCrochetStore((state) => state.progressPhotos);
  const photos = useMemo(
    () => progressPhotos.filter((photo) => photo.projectId === projectId).sort((a, b) => a.createdAt - b.createdAt),
    [progressPhotos, projectId],
  );
  const removeProgressPhoto = useCrochetStore((state) => state.removeProgressPhoto);
  const [busy, setBusy] = useState(false);

  const snap = async (source: CaptureSource) => {
    if (busy || !project) return;
    setBusy(true);
    tick('impact');
    const result = await captureProgressPhoto(source);
    setBusy(false);
    if (result.status === 'canceled') return;
    if (result.status === 'error') {
      onError(captureErrorMessage(result.reason, source));
      return;
    }
    onPreview(result.uri);
  };

  return (
    <View style={[styles.logScreen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text role="heading" aria-level={2} style={styles.title}>
            Progress Log
          </Text>
          <Text numberOfLines={1} style={styles.subtitle}>
            {project?.name ?? 'No project on the hook'}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close progress log"
          testID="progress-log-close"
          onPress={onClose}
          style={({ pressed }) => [styles.closeButton, pressed && styles.pressed, webCursor]}
        >
          <Text style={styles.closeGlyph}>×</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.logContent} showsVerticalScrollIndicator={false}>
        {banner ? <Text style={styles.banner}>{banner}</Text> : null}
        {photos.length > 0 ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Watch story reel"
              testID="watch-story"
              onPress={() => {
                tick();
                onWatch(0);
              }}
              style={({ pressed }) => [styles.watch, pressed && styles.pressed, webCursor]}
            >
              <Text style={styles.watchText}>Watch story reel</Text>
            </Pressable>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filmstrip}>
              {photos.map((photo, index) => (
                <Pressable
                  key={photo.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Play from row ${photo.row}`}
                  onPress={() => onWatch(index)}
                  style={({ pressed }) => [pressed && styles.pressed, webCursor]}
                >
                  <Image accessible={false} source={{ uri: photo.uri }} style={styles.filmThumb} />
                  <Text style={styles.filmLabel}>Row {photo.row}</Text>
                </Pressable>
              ))}
            </ScrollView>
            {photos.map((photo) => (
              <View key={photo.id} style={styles.shotRow}>
                <Image accessible={false} source={{ uri: photo.uri }} style={styles.shotThumb} />
                <View style={styles.shotCopy}>
                  <Text style={styles.shotTitle}>
                    Row {photo.row}/{photo.totalRows} ({photo.percent}%)
                  </Text>
                  <Text style={styles.shotMeta}>
                    {formatElapsed(photo.elapsedSeconds)} · {formatHookMillimeters(photo.hookSize)}
                  </Text>
                  {photo.caption ? (
                    <Text numberOfLines={2} style={styles.shotCaption}>
                      {photo.caption}
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove row ${photo.row} photo`}
                  onPress={() => {
                    tick();
                    removeProgressPhoto(photo.id);
                  }}
                  style={({ pressed }) => [styles.remove, pressed && styles.pressed, webCursor]}
                >
                  <Text style={styles.removeText}>Remove</Text>
                </Pressable>
              </View>
            ))}
          </>
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No stills yet</Text>
            <Text style={styles.emptyBody}>
              Snap the piece on the hook. Each photo keeps the row, the timer, and the hook size on a sticker, then plays back as a story.
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, Spacing.md) }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Take progress photo"
          testID="progress-camera"
          disabled={!project || busy}
          onPress={() => void snap('camera')}
          style={({ pressed }) => [styles.footerButton, (!project || busy) && styles.disabled, pressed && styles.pressed, webCursor]}
        >
          <Text style={styles.footerButtonText}>{Platform.OS === 'web' ? 'Use camera' : 'Take photo'}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Upload progress photo"
          testID="progress-upload"
          disabled={!project || busy}
          onPress={() => void snap('library')}
          style={({ pressed }) => [styles.footerButtonPrimary, (!project || busy) && styles.disabled, pressed && styles.pressed, webCursor]}
        >
          <Text style={styles.footerButtonPrimaryText}>Upload photo</Text>
        </Pressable>
      </View>
    </View>
  );
}

function PreviewStill({
  projectId,
  uri,
  onBack,
  onSaved,
  onRetake,
  onError,
}: {
  projectId: string | null;
  uri: string;
  onBack: () => void;
  onSaved: () => void;
  onRetake: (uri: string) => void;
  onError: (message: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const project = useCrochetStore((state) => state.projects.find((item) => item.id === projectId) ?? null);
  const addProgressPhoto = useCrochetStore((state) => state.addProgressPhoto);
  const [busy, setBusy] = useState(false);
  const [captionDraft, setCaptionDraft] = useState('');

  const sticker = project
    ? {
        projectName: project.name,
        row: project.currentRow,
        totalRows: project.totalRows,
        percent: rowPercent(project),
        elapsedSeconds: elapsedWholeSeconds(project),
        hookSize: project.hookSize,
      }
    : null;

  const onSave = () => {
    if (!project || !sticker || busy) return;
    tick('impact');
    const trimmedCaption = captionDraft.trim();
    const id = addProgressPhoto({
      projectId: project.id,
      uri,
      projectName: sticker.projectName,
      row: sticker.row,
      totalRows: sticker.totalRows,
      percent: sticker.percent,
      elapsedSeconds: sticker.elapsedSeconds,
      hookSize: sticker.hookSize,
      createdAt: Date.now(),
      ...(trimmedCaption ? { caption: trimmedCaption } : {}),
    });
    if (!id) {
      onError('Could not save that photo.');
      onBack();
      return;
    }
    onSaved();
  };

  const retake = async () => {
    if (busy) return;
    setBusy(true);
    const source: CaptureSource = Platform.OS === 'web' ? 'library' : 'camera';
    const result = await captureProgressPhoto(source);
    setBusy(false);
    if (result.status === 'canceled') return;
    if (result.status === 'error') {
      onError(captureErrorMessage(result.reason, source));
      return;
    }
    onRetake(result.uri);
  };

  return (
    <KeyboardAvoidingView
      style={styles.fill}
      behavior={Platform.OS === 'web' ? undefined : 'padding'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
    >
      <Image accessible={false} source={{ uri }} style={styles.bleed} resizeMode="cover" />
      <View style={[styles.previewTop, { paddingTop: insets.top + Spacing.sm }]} pointerEvents="box-none">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to progress log"
          onPress={onBack}
          style={({ pressed }) => [styles.glassButton, pressed && styles.pressed, webCursor]}
        >
          <Text style={styles.glassButtonText}>Back</Text>
        </Pressable>
      </View>
      {sticker ? <ProgressSticker {...sticker} caption={captionDraft.trim() || undefined} /> : null}
      <View style={[styles.previewBottom, { paddingBottom: Math.max(insets.bottom, Spacing.md) }]}>
        <View style={styles.captionBar}>
          <TextInput
            accessibilityLabel="Progress photo caption"
            testID="progress-photo-caption"
            value={captionDraft}
            onChangeText={setCaptionDraft}
            placeholder="Add a note…"
            placeholderTextColor="rgba(255, 255, 255, 0.45)"
            maxLength={120}
            multiline
            returnKeyType="done"
            blurOnSubmit
            style={styles.captionInput}
          />
        </View>
        <View style={styles.previewFooterRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retake photo"
          testID="progress-retake"
          disabled={busy}
          onPress={() => void retake()}
          style={({ pressed }) => [styles.footerButton, busy && styles.disabled, pressed && styles.pressed, webCursor]}
        >
          <Text style={styles.footerButtonText}>Retake</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Save progress photo"
          testID="save-progress-photo"
          disabled={!project || busy}
          onPress={onSave}
          style={({ pressed }) => [styles.footerButtonPrimary, (!project || busy) && styles.disabled, pressed && styles.pressed, webCursor]}
        >
          <Text style={styles.footerButtonPrimaryText}>Save to story</Text>
        </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function StoryReel({
  projectId,
  startIndex,
  onClose,
}: {
  projectId: string | null;
  startIndex: number;
  onClose: () => void;
}) {
  const progressPhotos = useCrochetStore((state) => state.progressPhotos);
  const photos = useMemo(
    () => progressPhotos.filter((photo) => photo.projectId === projectId).sort((a, b) => a.createdAt - b.createdAt),
    [progressPhotos, projectId],
  );
  if (photos.length === 0) {
    return (
      <View style={[styles.fill, styles.reelEmpty]}>
        <Text style={styles.emptyTitle}>Nothing to play</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close story" onPress={onClose} style={styles.watch}>
          <Text style={styles.watchText}>Close</Text>
        </Pressable>
      </View>
    );
  }
  const index = Math.min(startIndex, photos.length - 1);
  return <StoryPlayer photos={photos} startIndex={index} onClose={onClose} />;
}

function StoryPlayer({ photos, startIndex, onClose }: { photos: ProgressPhoto[]; startIndex: number; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(startIndex);
  const [elapsed, setElapsed] = useState(0);
  const paused = useRef(false);
  const indexRef = useRef(startIndex);
  const startedAt = useRef(0);
  const frozen = useRef(0);
  const downAt = useRef(0);
  const onCloseRef = useRef(onClose);
  const photo = photos[index] ?? photos[0];

  useEffect(() => {
    indexRef.current = index;
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    startedAt.current = Date.now();
    const timer = setInterval(() => {
      if (paused.current) return;
      const next = Date.now() - startedAt.current;
      if (next >= STORY_MS) {
        const following = indexRef.current + 1;
        if (following >= photos.length) {
          onCloseRef.current();
          return;
        }
        indexRef.current = following;
        startedAt.current = Date.now();
        setElapsed(0);
        setIndex(following);
      } else {
        setElapsed(next);
      }
    }, 40);
    return () => clearInterval(timer);
  }, [photos.length]);

  if (!photo) return null;

  const go = (direction: 1 | -1) => {
    const next = indexRef.current + direction;
    if (next >= photos.length) {
      onClose();
      return;
    }
    startedAt.current = Date.now();
    setElapsed(0);
    if (next < 0) return;
    indexRef.current = next;
    setIndex(next);
  };

  const onPressIn = () => {
    downAt.current = Date.now();
    paused.current = true;
    frozen.current = Date.now() - startedAt.current;
  };

  const onPressOut = (direction: 1 | -1) => {
    const held = Date.now() - downAt.current;
    paused.current = false;
    if (held < 220) {
      go(direction);
      return;
    }
    startedAt.current = Date.now() - frozen.current;
  };

  return (
    <View style={styles.fill} testID="story-reel">
      <Image accessible={false} source={{ uri: photo.uri }} style={styles.bleed} resizeMode="cover" />
      <View style={[styles.bars, { top: insets.top + Spacing.sm }]} pointerEvents="none">
        {photos.map((item, itemIndex) => (
          <View key={item.id} style={styles.barTrack}>
            <View
              style={[
                styles.barFill,
                {
                  width: itemIndex < index ? '100%' : itemIndex === index ? `${Math.min(100, (elapsed / STORY_MS) * 100)}%` : '0%',
                },
              ]}
            />
          </View>
        ))}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close story"
        testID="story-close"
        onPress={onClose}
        style={({ pressed }) => [styles.storyClose, { top: insets.top + Spacing.lg }, pressed && styles.pressed, webCursor]}
      >
        <Text style={styles.closeGlyph}>×</Text>
      </Pressable>
      <View style={styles.tapRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous progress photo"
          testID="story-prev"
          onPressIn={onPressIn}
          onPressOut={() => onPressOut(-1)}
          style={styles.tapLeft}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next progress photo"
          testID="story-next"
          onPressIn={onPressIn}
          onPressOut={() => onPressOut(1)}
          style={styles.tapRight}
        />
      </View>
      <ProgressSticker
        projectName={photo.projectName}
        row={photo.row}
        totalRows={photo.totalRows}
        percent={photo.percent}
        elapsedSeconds={photo.elapsedSeconds}
        hookSize={photo.hookSize}
        caption={photo.caption}
      />
    </View>
  );
}

function ProgressSticker({
  projectName,
  row,
  totalRows,
  percent,
  elapsedSeconds,
  hookSize,
  caption,
}: {
  projectName: string;
  row: number;
  totalRows: number;
  percent: number;
  elapsedSeconds: number;
  hookSize: string;
  caption?: string;
}) {
  const hook = formatHookMillimeters(hookSize);
  return (
    <View style={styles.sticker} pointerEvents="none" testID="progress-sticker">
      <View style={styles.stickerAccent} />
      <View style={styles.stickerCopy}>
        <Text style={styles.stickerKicker}>PROGRESS</Text>
        <Text numberOfLines={1} style={styles.stickerName}>
          {projectName}
        </Text>
        <Text style={styles.stickerRow}>
          Row {row}/{totalRows} ({percent}%)
        </Text>
        {caption ? (
          <Text numberOfLines={3} style={styles.stickerCaption}>
            {caption}
          </Text>
        ) : null}
        <Text style={styles.stickerMeta}>
          {formatElapsed(elapsedSeconds)} · {hook === '—' ? 'Hook —' : hook}
        </Text>
      </View>
    </View>
  );
}

function tick(kind: 'selection' | 'impact' = 'selection') {
  if (Platform.OS === 'web') return;
  if (kind === 'impact') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  else void Haptics.selectionAsync();
}

const webCursor = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : null;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.backgroundPrimary,
  },
  fill: {
    flex: 1,
    backgroundColor: '#000000',
  },
  logScreen: {
    flex: 1,
    backgroundColor: Colors.backgroundPrimary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.backgroundPrimary,
  },
  headerCopy: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...Typography.title,
    color: Colors.textPrimary,
  },
  subtitle: {
    ...Typography.callout,
    color: Colors.textSecondary,
  },
  closeButton: {
    width: 36,
    height: 36,
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
  logContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
    gap: Spacing.md,
    backgroundColor: Colors.backgroundPrimary,
  },
  banner: {
    ...Typography.callout,
    color: Colors.warning,
  },
  watch: {
    minHeight: 48,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accentPrimary,
    paddingHorizontal: Spacing.lg,
  },
  watchText: {
    ...Typography.label,
    color: Colors.onAccent,
  },
  filmstrip: {
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  filmThumb: {
    width: 72,
    height: 96,
    borderRadius: Radius.sm,
    backgroundColor: Colors.elevatedControl,
  },
  filmLabel: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
  shotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  shotThumb: {
    width: 72,
    height: 48,
    borderRadius: Radius.sm,
    backgroundColor: Colors.elevatedControl,
  },
  shotCopy: {
    flex: 1,
    gap: 2,
  },
  shotTitle: {
    ...Typography.label,
    color: Colors.textPrimary,
  },
  shotMeta: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  shotCaption: {
    ...Typography.caption,
    color: Colors.textPrimary,
    marginTop: 2,
  },
  remove: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
  },
  removeText: {
    ...Typography.caption,
    color: Colors.danger,
    fontWeight: FontWeight.semibold,
  },
  empty: {
    gap: Spacing.sm,
    paddingVertical: Spacing.xxl,
  },
  emptyTitle: {
    ...Typography.subhead,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  emptyBody: {
    ...Typography.callout,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  reelEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.lg,
    padding: Spacing.xl,
  },
  footer: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    backgroundColor: Colors.backgroundPrimary,
  },
  previewBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  captionBar: {
    borderRadius: Radius.lg,
    backgroundColor: 'rgba(18, 18, 18, 0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minHeight: 44,
    justifyContent: 'center',
  },
  captionInput: {
    ...Typography.callout,
    color: Colors.textPrimary,
    maxHeight: 72,
    padding: 0,
  },
  previewFooterRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  footerButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.elevatedControl,
  },
  footerButtonText: {
    ...Typography.label,
    color: Colors.textPrimary,
  },
  footerButtonPrimary: {
    flex: 1,
    minHeight: 48,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accentPrimary,
  },
  footerButtonPrimaryText: {
    ...Typography.label,
    color: Colors.onAccent,
  },
  disabled: {
    opacity: 0.4,
  },
  bleed: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#000000',
  },
  previewTop: {
    paddingHorizontal: Spacing.lg,
  },
  glassButton: {
    alignSelf: 'flex-start',
    minHeight: 36,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(18, 18, 18, 0.55)',
  },
  glassButtonText: {
    ...Typography.label,
    color: Colors.textPrimary,
  },
  sticker: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
    bottom: '22%',
    flexDirection: 'row',
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: 'rgba(18, 18, 18, 0.62)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  stickerAccent: {
    width: 4,
    backgroundColor: Colors.accentPrimary,
  },
  stickerCopy: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    gap: 2,
  },
  stickerKicker: {
    fontFamily: FontFamily.medium,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: FontWeight.bold,
    letterSpacing: 1.4,
    color: Colors.accentPrimary,
  },
  stickerName: {
    ...Typography.subhead,
    color: Colors.textPrimary,
  },
  stickerRow: {
    fontFamily: FontFamily.medium,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  stickerCaption: {
    ...Typography.callout,
    color: 'rgba(255, 255, 255, 0.92)',
    marginTop: 2,
  },
  stickerMeta: {
    ...Typography.callout,
    color: 'rgba(255, 255, 255, 0.82)',
  },
  bars: {
    position: 'absolute',
    left: Spacing.sm,
    right: Spacing.sm,
    zIndex: 2,
    flexDirection: 'row',
    gap: 4,
  },
  barTrack: {
    flex: 1,
    height: 3,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: Colors.textPrimary,
  },
  storyClose: {
    position: 'absolute',
    right: Spacing.lg,
    zIndex: 3,
    width: 36,
    height: 36,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(18, 18, 18, 0.55)',
  },
  tapRow: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row',
  },
  tapLeft: {
    width: '32%',
  },
  tapRight: {
    flex: 1,
  },
  pressed: {
    opacity: 0.72,
  },
});
