/**
 * Polaroid progress journal.
 *
 * A still freezes the project name, row, stitch count, timer, and an optional
 * milestone so later rows never rewrite the past. The log lays those stills
 * out like a desk of instant prints.
 */
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Image,
  Modal,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { G, Rect } from 'react-native-svg';

import { BrandMark } from '@/components/brand/BrandMark';
import { KeyboardSafeScrollView } from '@/components/ui/KeyboardSafeScrollView';
import {
  Colors,
  Elevation,
  FontFamily,
  FontWeight,
  Layout,
  Motion,
  Radius,
  Spacing,
  Typography,
} from '@/constants/BambuTheme';
import { useProjectTimer } from '@/hooks/useProjectTimer';
import {
  formatElapsed,
  rowPercent,
  useCrochetStore,
  type MilestoneTag,
  type ProgressPhoto,
} from '@/store/useCrochetStore';
import { formatHookMillimeters } from '@/utils/patternDisplay';
import {
  captureErrorMessage,
  captureProgressPhoto,
  pulseProgressHaptic,
  type CaptureSource,
} from '@/utils/progressPhoto';

const STORY_MS = 3200;
const STUDIO_MILESTONES = ['First Row', 'Color Change', 'WIP Check', 'Finished!'] as const satisfies readonly MilestoneTag[];

type PhotoView = 'log' | 'preview' | 'reel';
type Tilt = '-0.8deg' | '0.8deg' | '0deg';

type PhotoProgressModalProps = {
  visible: boolean;
  onClose: () => void;
  projectId: string | null;
  /** Still captured by the dashboard camera before this modal opened. */
  incomingUri?: string | null;
  initialView?: PhotoView;
  notice?: string | null;
};

type PolaroidModel = {
  uri: string;
  row: number;
  totalRows: number;
  stitchCount?: number;
  elapsedSeconds: number;
  createdAt: number;
  caption?: string;
  milestoneTag?: string;
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
  const [draftSource, setDraftSource] = useState<CaptureSource>(Platform.OS === 'web' ? 'library' : 'camera');
  const [banner, setBanner] = useState<string | null>(null);
  const [reelStart, setReelStart] = useState(0);
  const [showcaseId, setShowcaseId] = useState<string | null>(null);

  useEffect(() => {
    if (visible && !wasVisible.current) {
      setDraftUri(incomingUri);
      setView(incomingUri ? 'preview' : initialView);
      setBanner(notice);
      setReelStart(0);
      setShowcaseId(null);
    }
    wasVisible.current = visible;
  }, [visible, incomingUri, initialView, notice]);

  const requestClose = () => {
    if (showcaseId) {
      setShowcaseId(null);
      return;
    }
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
          <StagingStudio
            projectId={projectId}
            uri={draftUri}
            source={draftSource}
            onBack={requestClose}
            onSaved={() => {
              setDraftUri(null);
              setBanner(null);
              setView('log');
            }}
            onRetake={(uri, source) => {
              setDraftSource(source);
              setDraftUri(uri);
            }}
            onError={setBanner}
          />
        ) : (
          <ProgressLog
            projectId={projectId}
            banner={banner}
            showcaseId={showcaseId}
            onClose={onClose}
            onPreview={(uri, source) => {
              setBanner(null);
              setDraftSource(source);
              setDraftUri(uri);
              setView('preview');
            }}
            onError={setBanner}
            onWatch={(index) => {
              setShowcaseId(null);
              setReelStart(index);
              setView('reel');
            }}
            onShowcase={setShowcaseId}
            onCloseShowcase={() => setShowcaseId(null)}
          />
        )}
      </View>
    </Modal>
  );
}

function ProgressLog({
  projectId,
  banner,
  showcaseId,
  onClose,
  onPreview,
  onError,
  onWatch,
  onShowcase,
  onCloseShowcase,
}: {
  projectId: string | null;
  banner: string | null;
  showcaseId: string | null;
  onClose: () => void;
  onPreview: (uri: string, source: CaptureSource) => void;
  onError: (message: string) => void;
  onWatch: (index: number) => void;
  onShowcase: (photoId: string) => void;
  onCloseShowcase: () => void;
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
  const showcase = photos.find((photo) => photo.id === showcaseId) ?? null;
  const first = photos[0];
  const latest = photos[photos.length - 1];

  const snap = async (source: CaptureSource) => {
    if (busy || !project) return;
    setBusy(true);
    const result = await captureProgressPhoto(source);
    setBusy(false);
    if (result.status === 'canceled') return;
    if (result.status === 'error') {
      onError(captureErrorMessage(result.reason, source));
      return;
    }
    onPreview(result.uri, source);
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

      <View style={styles.segment}>
        <ActionSegment
          label="Snap Instant Photo"
          accessibilityLabel="Snap instant photo"
          testID="progress-camera"
          disabled={!project || busy}
          onPress={() => void snap('camera')}
        />
        <ActionSegment
          label="Import from Studio"
          accessibilityLabel="Import from studio"
          testID="progress-upload"
          disabled={!project || busy}
          primary
          onPress={() => void snap('library')}
        />
      </View>

      <KeyboardSafeScrollView contentContainerStyle={styles.logContent} showsVerticalScrollIndicator={false}>
        {banner ? <Text style={styles.banner}>{banner}</Text> : null}
        {photos.length === 0 || !first || !latest ? (
          <EmptyJournal />
        ) : (
          <>
            {photos.length >= 2 ? (
              <CompareCard first={first} latest={latest} onOpen={onShowcase} />
            ) : null}
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
              <Text style={styles.watchText}>Play story reel</Text>
            </Pressable>
            <View style={styles.timeline}>
              <View style={styles.yarn} />
              {photos.map((photo, index) => {
                const previous = photos[index - 1];
                const showDay = !previous || dayKey(previous.createdAt) !== dayKey(photo.createdAt);
                return (
                  <View key={photo.id} style={styles.entry}>
                    {showDay ? <Text style={styles.dayHeader}>{formatDay(photo.createdAt)}</Text> : null}
                    {previous ? (
                      <View style={styles.deltaPill}>
                        <Text style={styles.deltaText}>{rowDeltaLabel(photoRow(photo), photoRow(previous))}</Text>
                      </View>
                    ) : null}
                    <PolaroidFrame
                      model={modelFromPhoto(photo)}
                      tilt={index % 2 === 0 ? '-0.8deg' : '0.8deg'}
                      onPress={() => onShowcase(photo.id)}
                    />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove row ${photoRow(photo)} photo`}
                      onPress={() => {
                        tick();
                        removeProgressPhoto(photo.id);
                        if (showcaseId === photo.id) onCloseShowcase();
                      }}
                      style={({ pressed }) => [styles.remove, pressed && styles.pressed, webCursor]}
                    >
                      <Text style={styles.removeText}>Remove</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </>
        )}
      </KeyboardSafeScrollView>

      {showcase && project ? (
        <Showcase photo={showcase} projectName={project.name} onClose={onCloseShowcase} />
      ) : null}
    </View>
  );
}

function StagingStudio({
  projectId,
  uri,
  source,
  onBack,
  onSaved,
  onRetake,
  onError,
}: {
  projectId: string | null;
  uri: string;
  source: CaptureSource;
  onBack: () => void;
  onSaved: () => void;
  onRetake: (uri: string, source: CaptureSource) => void;
  onError: (message: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const project = useCrochetStore((state) => state.projects.find((item) => item.id === projectId) ?? null);
  const addProgressPhoto = useCrochetStore((state) => state.addProgressPhoto);
  const timer = useProjectTimer(projectId);
  const [busy, setBusy] = useState(false);
  const [captionDraft, setCaptionDraft] = useState('');
  const [milestone, setMilestone] = useState<MilestoneTag | null>(null);
  const stampedAt = useRef(Date.now()).current;

  const onSave = () => {
    if (!project || busy) return;
    void pulseProgressHaptic('save');
    const trimmed = captionDraft.trim();
    const id = addProgressPhoto({
      projectId: project.id,
      uri,
      projectName: project.name,
      row: project.currentRow,
      rowNumber: project.currentRow,
      totalRows: project.totalRows,
      percent: rowPercent(project),
      elapsedSeconds: timer.seconds,
      sessionDurationSeconds: timer.seconds,
      stitchCount: project.currentStitch,
      hookSize: project.hookSize,
      createdAt: Date.now(),
      ...(trimmed ? { caption: trimmed, note: trimmed } : {}),
      ...(milestone ? { milestoneTag: milestone } : {}),
    });
    if (!id) {
      onError('Could not save that photo.');
      onBack();
      return;
    }
    onSaved();
  };

  const retake = async (nextSource: CaptureSource) => {
    if (busy) return;
    setBusy(true);
    const result = await captureProgressPhoto(nextSource);
    setBusy(false);
    if (result.status === 'canceled') return;
    if (result.status === 'error') {
      onError(captureErrorMessage(result.reason, nextSource));
      return;
    }
    onRetake(result.uri, nextSource);
  };

  const draft: PolaroidModel | null = project
    ? {
        uri,
        row: project.currentRow,
        totalRows: project.totalRows,
        stitchCount: project.currentStitch,
        elapsedSeconds: timer.seconds,
        createdAt: stampedAt,
        caption: captionDraft.trim() || undefined,
        milestoneTag: milestone ?? undefined,
      }
    : null;

  return (
    <View style={[styles.logScreen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to progress log"
          onPress={onBack}
          style={({ pressed }) => [styles.glassButton, pressed && styles.pressed, webCursor]}
        >
          <Text style={styles.glassButtonText}>Back</Text>
        </Pressable>
        <View style={styles.headerCopy}>
          <Text role="heading" aria-level={2} style={styles.title}>
            Staging Studio
          </Text>
          <Text numberOfLines={1} style={styles.subtitle}>
            {project?.name ?? 'No project on the hook'}
          </Text>
        </View>
      </View>

      <KeyboardSafeScrollView contentContainerStyle={styles.studioContent} showsVerticalScrollIndicator={false}>
        {draft ? (
          <DevelopingFrame uri={uri}>
            <PolaroidFrame
              model={draft}
              tilt="0deg"
              developing
              chin={
                <View style={styles.editor}>
                  <TextInput
                    accessibilityLabel="Progress photo caption"
                    testID="progress-photo-caption"
                    value={captionDraft}
                    onChangeText={setCaptionDraft}
                    placeholder="A note for this row…"
                    placeholderTextColor={Colors.textTertiary}
                    maxLength={120}
                    multiline
                    returnKeyType="done"
                    blurOnSubmit
                    style={styles.captionInput}
                  />
                  <View style={styles.chips}>
                    {STUDIO_MILESTONES.map((tag) => {
                      const selected = milestone === tag;
                      return (
                        <Pressable
                          key={tag}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          accessibilityLabel={tag}
                          onPress={() => {
                            tick();
                            setMilestone(selected ? null : tag);
                          }}
                          style={({ pressed }) => [
                            styles.chip,
                            selected && styles.chipSelected,
                            pressed && styles.pressed,
                            webCursor,
                          ]}
                        >
                          <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{tag}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              }
            />
          </DevelopingFrame>
        ) : (
          <Text style={styles.emptyBody}>Open a project before pinning a still.</Text>
        )}

        <View style={[styles.segment, styles.segmentFlush]}>
          <ActionSegment
            label="Snap Instant Photo"
            accessibilityLabel="Retake with camera"
            testID="progress-retake"
            disabled={busy}
            primary={source === 'camera'}
            onPress={() => void retake('camera')}
          />
          <ActionSegment
            label="Import from Studio"
            accessibilityLabel="Replace from photo library"
            disabled={busy}
            primary={source === 'library'}
            onPress={() => void retake('library')}
          />
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Pin Polaroid to log"
          testID="save-progress-photo"
          disabled={!project || busy}
          onPress={onSave}
          style={({ pressed }) => [
            styles.pinButton,
            (!project || busy) && styles.disabled,
            pressed && styles.pressed,
            webCursor,
          ]}
        >
          <Text style={styles.pinButtonText}>Pin Polaroid to Log</Text>
        </Pressable>
        <View style={{ height: Math.max(insets.bottom, Spacing.md) }} />
      </KeyboardSafeScrollView>
    </View>
  );
}

function Showcase({
  photo,
  projectName,
  onClose,
}: {
  photo: ProgressPhoto;
  projectName: string;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const seconds = photoSeconds(photo);
  const [notice, setNotice] = useState<string | null>(null);
  const onShare = async () => {
    setNotice(null);
    const shared = await sharePolaroid(photo);
    if (!shared) setNotice('Sharing is not available on this device.');
  };
  return (
    <View style={styles.showcase} testID="polaroid-showcase">
      <KeyboardSafeScrollView
        style={styles.showcaseScroll}
        contentContainerStyle={[
          styles.showcaseBody,
          { paddingTop: insets.top + Spacing.md, paddingBottom: Math.max(insets.bottom, Spacing.lg) },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close showcase"
          onPress={onClose}
          style={({ pressed }) => [styles.closeButton, styles.showcaseClose, pressed && styles.pressed, webCursor]}
        >
          <Text style={styles.closeGlyph}>×</Text>
        </Pressable>
        <Text style={styles.showcaseKicker}>Progress snapshot</Text>
        <Text numberOfLines={2} style={styles.showcaseTitle}>
          {projectName}
        </Text>
        <Text style={styles.showcaseMeta}>
          Row {photoRow(photo)}/{photo.totalRows} · {formatElapsed(seconds)} logged
        </Text>
        <PolaroidFrame model={modelFromPhoto(photo)} tilt="0deg" watermark />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Share Polaroid"
          testID="share-polaroid"
          onPress={() => void onShare()}
          style={({ pressed }) => [styles.pinButton, pressed && styles.pressed, webCursor]}
        >
          <Text style={styles.pinButtonText}>Share Polaroid</Text>
        </Pressable>
        {notice ? <Text style={styles.banner}>{notice}</Text> : null}
      </KeyboardSafeScrollView>
    </View>
  );
}

function CompareCard({
  first,
  latest,
  onOpen,
}: {
  first: ProgressPhoto;
  latest: ProgressPhoto;
  onOpen: (photoId: string) => void;
}) {
  return (
    <View style={styles.compare} testID="then-vs-now">
      <Text style={styles.compareKicker}>Then vs. Now</Text>
      <View style={styles.compareRow}>
        <View style={styles.compareSlot}>
          <Text style={styles.compareLabel}>First</Text>
          <PolaroidFrame model={modelFromPhoto(first)} tilt="-0.8deg" compact onPress={() => onOpen(first.id)} />
        </View>
        <View style={styles.compareSlot}>
          <Text style={styles.compareLabel}>Latest</Text>
          <PolaroidFrame model={modelFromPhoto(latest)} tilt="0.8deg" compact onPress={() => onOpen(latest.id)} />
        </View>
      </View>
      <Text style={styles.compareDelta}>{rowDeltaLabel(photoRow(latest), photoRow(first), 'the first snap')}</Text>
    </View>
  );
}

function PolaroidFrame({
  model,
  tilt = '0deg',
  compact = false,
  developing = false,
  watermark = false,
  onPress,
  chin,
}: {
  model: PolaroidModel;
  tilt?: Tilt;
  compact?: boolean;
  developing?: boolean;
  watermark?: boolean;
  onPress?: () => void;
  chin?: ReactNode;
}) {
  const stitch =
    model.stitchCount != null ? ` · ${model.stitchCount} ${model.stitchCount === 1 ? 'st' : 'sts'}` : '';
  const card = (
    <View style={[styles.frame, compact && styles.frameCompact, { transform: [{ rotate: tilt }] }, Elevation.floating]}>
      <View style={[styles.photoWell, compact && styles.photoWellCompact]}>
        <Image accessible={false} source={{ uri: model.uri }} style={styles.photo} resizeMode="cover" />
        <View pointerEvents="none" style={styles.photoMount} />
        {developing ? <DevelopingVeil uri={model.uri} /> : null}
      </View>
      <View style={[styles.chin, compact && styles.chinCompact]}>
        {chin ??
          (model.caption ? (
            <Text numberOfLines={compact ? 2 : 4} style={styles.hand}>
              {model.caption}
            </Text>
          ) : (
            <Text style={styles.handMuted}>{compact ? ' ' : 'No note on this print'}</Text>
          ))}
        <View style={styles.stampRow}>
          <View style={styles.countPill}>
            <Text style={styles.countPillText}>
              Row {model.row}
              {stitch}
            </Text>
          </View>
          <Text style={styles.timerStamp}>{formatElapsed(model.elapsedSeconds)}</Text>
        </View>
        <View style={styles.stampRow}>
          <Text style={styles.dateStamp}>{formatDay(model.createdAt)}</Text>
          {model.milestoneTag ? (
            <View style={styles.milestoneBadge}>
              <Text style={styles.milestoneText}>{model.milestoneTag}</Text>
            </View>
          ) : null}
        </View>
        {watermark ? (
          <View style={styles.watermark}>
            <BrandMark size={18} />
            <Text style={styles.watermarkText}>Crochet Handy</Text>
          </View>
        ) : null}
      </View>
    </View>
  );

  if (!onPress) return card;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open polaroid from row ${model.row}`}
      onPress={onPress}
      style={({ pressed }) => [pressed && styles.pressed, webCursor]}
    >
      {card}
    </Pressable>
  );
}

function DevelopingFrame({ uri, children }: { uri: string; children: ReactNode }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.94)).current;

  useEffect(() => {
    opacity.setValue(0);
    scale.setValue(0.94);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: Motion.slow, useNativeDriver: nativeDriver }),
      Animated.timing(scale, { toValue: 1, duration: Motion.slow, useNativeDriver: nativeDriver }),
    ]).start();
  }, [uri, opacity, scale]);

  return <Animated.View style={{ opacity, transform: [{ scale }] }}>{children}</Animated.View>;
}

function DevelopingVeil({ uri }: { uri: string }) {
  const veil = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    veil.setValue(1);
    Animated.timing(veil, { toValue: 0, duration: Motion.slow + 220, useNativeDriver: nativeDriver }).start();
  }, [uri, veil]);
  return <Animated.View pointerEvents="none" style={[styles.veil, { opacity: veil }]} />;
}

function ActionSegment({
  label,
  accessibilityLabel,
  testID,
  disabled,
  primary = false,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  testID?: string;
  disabled?: boolean;
  primary?: boolean;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const spring = (toValue: number) => {
    Animated.spring(scale, {
      toValue,
      useNativeDriver: nativeDriver,
      damping: Motion.spring.damping,
      stiffness: Motion.spring.stiffness,
      mass: Motion.spring.mass,
    }).start();
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => spring(0.97)}
      onPressOut={() => spring(1)}
      style={[styles.segmentSlot, disabled && styles.disabled, webCursor]}
    >
      <Animated.View style={[styles.segmentFace, primary && styles.segmentFacePrimary, { transform: [{ scale }] }]}>
        <Text style={[styles.segmentLabel, primary && styles.segmentLabelOn]}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

function EmptyJournal() {
  return (
    <View style={styles.emptyCard}>
      <EmptyPolaroidStack />
      <Text style={styles.emptyTitle}>Your first print is waiting</Text>
      <Text style={styles.emptyBody}>
        Snap a stitch milestone. Each Polaroid keeps the row, the timer, and a note, then lines up as the piece grows.
      </Text>
    </View>
  );
}

const EMPTY_POLAROID_SWAP_MS = Motion.slow + 280;
const EMPTY_POLAROID_HOLD_MS = 520;

function polaroidRotateTransform(
  t: number,
  from: { rot: number; cx: number; cy: number },
  to: { rot: number; cx: number; cy: number },
) {
  const rot = from.rot + (to.rot - from.rot) * t;
  const cx = from.cx + (to.cx - from.cx) * t;
  const cy = from.cy + (to.cy - from.cy) * t;
  return `rotate(${rot} ${cx} ${cy})`;
}

function EmptyPolaroidBack({ transform }: { transform: string }) {
  return (
    <G>
      <Rect x="18" y="22" width="78" height="96" rx="6" fill={Colors.elevatedControl} transform={transform} />
      <Rect x="28" y="32" width="58" height="52" rx="2" fill={Colors.backgroundPrimary} transform={transform} />
    </G>
  );
}

function EmptyPolaroidFront({ transform }: { transform: string }) {
  return (
    <G>
      <Rect
        x="72"
        y="12"
        width="78"
        height="96"
        rx="6"
        fill={Colors.backgroundPrimary}
        stroke={Colors.border}
        strokeWidth={1}
        transform={transform}
      />
      <Rect x="82" y="22" width="58" height="52" rx="2" fill={Colors.elevatedControl} transform={transform} />
      <Rect x="86" y="80" width="28" height="6" rx="3" fill={Colors.accentPrimary} transform={transform} />
    </G>
  );
}

function EmptyPolaroidStack() {
  const progress = useRef(new Animated.Value(0)).current;
  const [t, setT] = useState(0);

  useEffect(() => {
    const sub = progress.addListener(({ value }) => setT(value));
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: EMPTY_POLAROID_SWAP_MS,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.delay(EMPTY_POLAROID_HOLD_MS),
        Animated.timing(progress, {
          toValue: 0,
          duration: EMPTY_POLAROID_SWAP_MS,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.delay(EMPTY_POLAROID_HOLD_MS),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      progress.removeListener(sub);
    };
  }, [progress]);

  const backPose = { rot: -8, cx: 57, cy: 70 };
  const frontPose = { rot: 6, cx: 111, cy: 60 };
  const backTransform = polaroidRotateTransform(t, backPose, frontPose);
  const frontTransform = polaroidRotateTransform(t, frontPose, backPose);
  const backOnTop = t >= 0.5;

  return (
    <Svg width={168} height={112} viewBox="0 0 168 112">
      {backOnTop ? (
        <>
          <EmptyPolaroidFront transform={frontTransform} />
          <EmptyPolaroidBack transform={backTransform} />
        </>
      ) : (
        <>
          <EmptyPolaroidBack transform={backTransform} />
          <EmptyPolaroidFront transform={frontTransform} />
        </>
      )}
    </Svg>
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
      <ProgressSticker photo={photo} />
    </View>
  );
}

function ProgressSticker({ photo }: { photo: ProgressPhoto }) {
  const hook = formatHookMillimeters(photo.hookSize);
  const note = photo.caption ?? photo.note;
  return (
    <View style={styles.sticker} pointerEvents="none" testID="progress-sticker">
      <View style={styles.stickerAccent} />
      <View style={styles.stickerCopy}>
        <Text style={styles.stickerKicker}>PROGRESS</Text>
        <Text numberOfLines={1} style={styles.stickerName}>
          {photo.projectName}
        </Text>
        <Text style={styles.stickerRow}>
          Row {photoRow(photo)}/{photo.totalRows} ({photo.percent}%)
        </Text>
        {note ? (
          <Text numberOfLines={3} style={styles.stickerCaption}>
            {note}
          </Text>
        ) : null}
        <Text style={styles.stickerMeta}>
          {formatElapsed(photoSeconds(photo))} · {hook === '—' ? 'Hook —' : hook}
          {photo.milestoneTag ? ` · ${photo.milestoneTag}` : ''}
        </Text>
      </View>
    </View>
  );
}

function modelFromPhoto(photo: ProgressPhoto): PolaroidModel {
  return {
    uri: photo.uri,
    row: photoRow(photo),
    totalRows: photo.totalRows,
    stitchCount: photo.stitchCount,
    elapsedSeconds: photoSeconds(photo),
    createdAt: photo.createdAt,
    caption: photo.caption ?? photo.note,
    milestoneTag: photo.milestoneTag,
  };
}

function photoRow(photo: ProgressPhoto): number {
  return photo.rowNumber ?? photo.row;
}

function photoSeconds(photo: ProgressPhoto): number {
  return photo.sessionDurationSeconds ?? photo.elapsedSeconds;
}

function dayKey(createdAt: number): string {
  const date = new Date(createdAt);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatDay(createdAt: number): string {
  return new Date(createdAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function rowDeltaLabel(current: number, previous: number, since = 'last snap'): string {
  const delta = current - previous;
  if (delta === 0) return `Same row as ${since}`;
  const sign = delta > 0 ? '+' : '';
  const noun = Math.abs(delta) === 1 ? 'row' : 'rows';
  return `${sign}${delta} ${noun} since ${since}`;
}

async function sharePolaroid(photo: ProgressPhoto): Promise<boolean> {
  const note = photo.caption ?? photo.note;
  const lines = [
    photo.projectName,
    `Row ${photoRow(photo)}/${photo.totalRows}`,
    photo.stitchCount != null ? `Stitch ${photo.stitchCount}` : null,
    `${formatElapsed(photoSeconds(photo))} logged`,
    photo.milestoneTag ?? null,
    note ?? null,
  ].filter((line): line is string => Boolean(line));
  const message = lines.join('\n');
  const fileUri = photo.uri.startsWith('data:') ? null : photo.uri;
  try {
    await Share.share(Platform.OS === 'ios' && fileUri ? { message, url: fileUri } : { message });
    return true;
  } catch (error) {
    const messageText = error instanceof Error ? error.message : '';
    return /cancel|dismiss/i.test(messageText);
  }
}

function tick(kind: 'selection' | 'impact' = 'selection') {
  if (Platform.OS === 'web') return;
  if (kind === 'impact') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  else void Haptics.selectionAsync();
}

const webCursor = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : null;
const nativeDriver = Platform.OS !== 'web';
const hairline = Layout.hairline ?? StyleSheet.hairlineWidth;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.backgroundPrimary,
  },
  fill: {
    flex: 1,
    backgroundColor: Colors.backgroundPrimary,
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
  segment: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    padding: Spacing.xs,
    borderRadius: Radius.pill,
    backgroundColor: Colors.elevatedControl,
  },
  segmentFlush: {
    marginHorizontal: Spacing.none,
    marginBottom: Spacing.none,
  },
  segmentSlot: {
    flex: 1,
  },
  segmentFace: {
    minHeight: 44,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  segmentFacePrimary: {
    backgroundColor: Colors.accentPrimary,
  },
  segmentLabel: {
    ...Typography.caption,
    color: Colors.textPrimary,
    fontWeight: FontWeight.semibold,
    textAlign: 'center',
  },
  segmentLabelOn: {
    color: Colors.onAccent,
  },
  logContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.huge,
    gap: Spacing.lg,
  },
  studioContent: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.lg,
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
  timeline: {
    position: 'relative',
    gap: Spacing.xl,
    paddingLeft: Spacing.lg,
  },
  yarn: {
    position: 'absolute',
    left: 6,
    top: Spacing.sm,
    bottom: Spacing.sm,
    width: 2,
    borderRadius: Radius.pill,
    backgroundColor: Colors.accentPrimary,
    opacity: 0.4,
  },
  entry: {
    gap: Spacing.sm,
  },
  dayHeader: {
    ...Typography.caption,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  deltaPill: {
    alignSelf: 'flex-start',
    borderRadius: Radius.pill,
    backgroundColor: Colors.accentMuted,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xxs,
  },
  deltaText: {
    ...Typography.caption,
    color: Colors.accentPrimary,
    fontWeight: FontWeight.semibold,
  },
  compare: {
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.cardSurface,
  },
  compareKicker: {
    ...Typography.caption,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  compareRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  compareSlot: {
    flex: 1,
    gap: Spacing.xs,
  },
  compareLabel: {
    ...Typography.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  compareDelta: {
    ...Typography.caption,
    color: Colors.accentPrimary,
    textAlign: 'center',
    fontWeight: FontWeight.semibold,
  },
  frame: {
    backgroundColor: Colors.cardSurface,
    borderRadius: Radius.sm,
    paddingTop: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.xl,
    gap: Spacing.md,
  },
  frameCompact: {
    paddingTop: Spacing.xs,
    paddingHorizontal: Spacing.xs,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  photoWell: {
    aspectRatio: 4 / 5,
    borderRadius: Radius.xs,
    overflow: 'hidden',
    backgroundColor: Colors.elevatedControl,
  },
  photoWellCompact: {
    aspectRatio: 1,
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  photoMount: {
    ...StyleSheet.absoluteFill,
    borderWidth: hairline,
    borderColor: Colors.border,
    borderRadius: Radius.xs,
  },
  veil: {
    ...StyleSheet.absoluteFill,
    backgroundColor: Colors.cardSurface,
  },
  chin: {
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    paddingBottom: Spacing.xs,
  },
  chinCompact: {
    gap: Spacing.xs,
  },
  hand: {
    ...Typography.body,
    fontStyle: 'italic',
    color: Colors.textPrimary,
  },
  handMuted: {
    ...Typography.callout,
    fontStyle: 'italic',
    color: Colors.textTertiary,
  },
  stampRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  countPill: {
    borderRadius: Radius.pill,
    backgroundColor: Colors.elevatedControl,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xxs,
  },
  countPillText: {
    ...Typography.caption,
    color: Colors.textPrimary,
    fontWeight: FontWeight.semibold,
  },
  timerStamp: {
    ...Typography.caption,
    color: Colors.textSecondary,
    fontFamily: FontFamily.mono,
  },
  dateStamp: {
    ...Typography.caption,
    color: Colors.textSecondary,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  milestoneBadge: {
    borderRadius: Radius.pill,
    backgroundColor: Colors.accentMuted,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xxs,
  },
  milestoneText: {
    ...Typography.caption,
    color: Colors.accentPrimary,
    fontWeight: FontWeight.semibold,
  },
  watermark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  watermarkText: {
    ...Typography.caption,
    color: Colors.textTertiary,
  },
  editor: {
    gap: Spacing.sm,
  },
  captionInput: {
    ...Typography.body,
    fontStyle: 'italic',
    color: Colors.textPrimary,
    minHeight: 44,
    padding: 0,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  chip: {
    borderRadius: Radius.pill,
    backgroundColor: Colors.elevatedControl,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  chipSelected: {
    backgroundColor: Colors.accentMuted,
  },
  chipText: {
    ...Typography.caption,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
  },
  chipTextSelected: {
    color: Colors.accentPrimary,
  },
  pinButton: {
    minHeight: 48,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accentPrimary,
    paddingHorizontal: Spacing.lg,
  },
  pinButtonText: {
    ...Typography.label,
    color: Colors.onAccent,
  },
  remove: {
    alignSelf: 'flex-end',
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
  },
  removeText: {
    ...Typography.caption,
    color: Colors.danger,
    fontWeight: FontWeight.semibold,
  },
  emptyCard: {
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.lg,
    backgroundColor: Colors.cardSurface,
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
  glassButton: {
    alignSelf: 'flex-start',
    minHeight: 36,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.elevatedControl,
  },
  glassButtonText: {
    ...Typography.label,
    color: Colors.textPrimary,
  },
  showcase: {
    ...StyleSheet.absoluteFill,
    zIndex: 4,
    backgroundColor: Colors.backgroundPrimary,
  },
  showcaseScroll: {
    flex: 1,
  },
  showcaseBody: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  showcaseClose: {
    alignSelf: 'flex-end',
  },
  showcaseKicker: {
    ...Typography.caption,
    color: Colors.textSecondary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  showcaseTitle: {
    ...Typography.headline,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  showcaseMeta: {
    ...Typography.callout,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  disabled: {
    opacity: 0.4,
  },
  bleed: {
    ...StyleSheet.absoluteFill,
    backgroundColor: Colors.backgroundPrimary,
  },
  sticker: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
    bottom: '22%',
    flexDirection: 'row',
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.cardSurface,
    borderWidth: hairline,
    borderColor: Colors.border,
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
    ...Typography.tab,
    fontWeight: FontWeight.bold,
    letterSpacing: 1.4,
    color: Colors.accentPrimary,
  },
  stickerName: {
    ...Typography.subhead,
    color: Colors.textPrimary,
  },
  stickerRow: {
    ...Typography.headline,
    color: Colors.textPrimary,
  },
  stickerCaption: {
    ...Typography.callout,
    color: Colors.textPrimary,
    marginTop: 2,
  },
  stickerMeta: {
    ...Typography.callout,
    color: Colors.textSecondary,
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
    backgroundColor: Colors.elevatedControl,
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
    backgroundColor: Colors.elevatedControl,
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
