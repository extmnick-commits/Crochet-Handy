/**
 * Leftover yarn scanner. Photos reuse the progress-photo picker. Suggestions
 * come from the on-device model when it is downloaded, otherwise from the
 * offline scrap rules in `utils/scrapYarnAi.ts`.
 */
import { useEffect, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { YarnColorSwatchPicker } from '@/components/YarnColorSwatchPicker';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Colors, FontWeight, Layout, Radius, Spacing, Typography } from '@/constants/BambuTheme';
import { YARN_WEIGHTS, useCrochetStore, type CrochetPattern, type YarnWeight } from '@/store/useCrochetStore';
import { yarnWeightMeta } from '@/utils/patternDisplay';
import { captureErrorMessage, captureProgressPhoto, type CaptureSource } from '@/utils/progressPhoto';
import {
  LOCAL_AI_ENGINE_LABEL,
  YARDAGE_TIERS,
  analyzeLeftoverYarnAndSuggest,
  deleteScrapModel,
  downloadScrapModel,
  hookForYarnWeight,
  isLocalScrapAiSupported,
  isScrapModelDownloaded,
  type ScannedLeftoverDraft,
  type ScrapSuggestionResult,
  type ScrapYarnColor,
  type YardageTier,
} from '@/utils/scrapYarnAi';
import { formatYarnColorLabel, type YarnNamedColor } from '@/utils/yarnColorExtractor';

type ScrapBusterModalProps = {
  visible: boolean;
  onClose: () => void;
  onOpenPattern: (patternId: string) => void;
  onSaveToStash: (draft: ScannedLeftoverDraft) => void;
};

type EngineState = 'checking' | 'unsupported' | 'missing' | 'downloading' | 'ready';

export function ScrapBusterModal({ visible, onClose, onOpenPattern, onSaveToStash }: ScrapBusterModalProps) {
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      header={
        visible ? (
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text role="heading" aria-level={2} style={styles.title}>
                Leftover yarn
              </Text>
              <Text style={styles.subtitle}>Scan scraps and get small projects that use those colors</Text>
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
      {visible ? <ScrapBusterForm onOpenPattern={onOpenPattern} onSaveToStash={onSaveToStash} /> : null}
    </BottomSheet>
  );
}

function ScrapBusterForm({
  onOpenPattern,
  onSaveToStash,
}: {
  onOpenPattern: (patternId: string) => void;
  onSaveToStash: (draft: ScannedLeftoverDraft) => void;
}) {
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [selected, setSelected] = useState<ScrapYarnColor[]>([]);
  const [weight, setWeight] = useState<YarnWeight>('worsted');
  const [tier, setTier] = useState<YardageTier>('small_25_75yd');
  const [engine, setEngine] = useState<EngineState>(() => (isLocalScrapAiSupported() ? 'checking' : 'unsupported'));
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ScrapSuggestionResult | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isLocalScrapAiSupported()) return undefined;
    let alive = true;
    void isScrapModelDownloaded().then((ready) => {
      if (alive) setEngine(ready ? 'ready' : 'missing');
    });
    return () => {
      alive = false;
    };
  }, []);

  const onCapture = async (source: CaptureSource) => {
    setStatus(null);
    const captured = await captureProgressPhoto(source);
    if (captured.status === 'canceled') return;
    if (captured.status === 'error') {
      setStatus(captureErrorMessage(captured.reason, source));
      return;
    }
    setPhotoUri(captured.uri);
    setResult(null);
    setSelected([]);
  };

  const onDetectedColors = (colors: YarnNamedColor[]) => {
    setResult(null);
    setSelected(colors.map((color) => ({ hex: color.hex, name: color.name })));
  };

  const onDownload = async () => {
    setEngine('downloading');
    setProgress(0);
    setStatus(null);
    try {
      await downloadScrapModel((update) => setProgress(update.ratio));
      setEngine('ready');
      setProgress(1);
    } catch (error) {
      setEngine('missing');
      setStatus(error instanceof Error ? error.message : 'The local AI engine could not be downloaded.');
    }
  };

  const onDeleteEngine = async () => {
    await deleteScrapModel();
    setEngine('missing');
    setProgress(0);
  };

  const onSuggest = async () => {
    if (!photoUri || selected.length === 0 || busy) {
      if (!photoUri) setStatus('Take a photo of the leftover yarn first.');
      else if (selected.length === 0) setStatus('Choose at least one leftover color.');
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const next = await analyzeLeftoverYarnAndSuggest({
        imageUri: photoUri,
        colors: selected.map((color) => formatYarnColorLabel(color)),
        weight,
        yardageTier: tier,
      });
      setResult(next);
    } catch {
      setStatus('Could not build suggestions. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.form}>
      <View style={styles.captureRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Take a photo of leftover yarn"
          onPress={() => {
            void onCapture('camera');
          }}
          style={({ pressed }) => [styles.captureButton, pressed && styles.pressed, webCursor]}
        >
          <YarnBallIcon color={Colors.textPrimary} />
          <Text style={styles.captureLabel}>Take photo</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose a leftover yarn photo"
          onPress={() => {
            void onCapture('library');
          }}
          style={({ pressed }) => [styles.captureButton, pressed && styles.pressed, webCursor]}
        >
          <Text style={styles.captureLabel}>Photo library</Text>
        </Pressable>
      </View>

      {photoUri ? <Image accessible={false} source={{ uri: photoUri }} style={styles.preview} /> : null}

      <View style={styles.field}>
        <Text style={styles.label}>Leftover colors</Text>
        {photoUri ? (
          <YarnColorSwatchPicker imageUri={photoUri} maxColors={4} onChange={onDetectedColors} />
        ) : (
          <Text style={styles.note}>Take a photo, then keep the yarn colors and drop the table.</Text>
        )}
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Leftover amount</Text>
        <View style={styles.chips}>
          {YARDAGE_TIERS.map((option) => {
            const active = tier === option.id;
            return (
              <Pressable
                key={option.id}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => {
                  setTier(option.id);
                  setResult(null);
                }}
                style={({ pressed }) => [styles.chip, active && styles.chipSelected, pressed && styles.pressed, webCursor]}
              >
                <Text style={[styles.chipText, active && styles.chipTextSelected]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Yarn weight</Text>
        <View style={styles.chips}>
          {YARN_WEIGHTS.map((option) => {
            const meta = yarnWeightMeta(option);
            const active = weight === option;
            return (
              <Pressable
                key={option}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => {
                  setWeight(option);
                  setResult(null);
                }}
                style={({ pressed }) => [styles.chip, active && styles.chipSelected, pressed && styles.pressed, webCursor]}
              >
                <Text style={[styles.chipText, active && styles.chipTextSelected]}>
                  {meta.label} {meta.number}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <EngineCard
        engine={engine}
        progress={progress}
        onDownload={() => {
          void onDownload();
        }}
        onDelete={() => {
          void onDeleteEngine();
        }}
      />

      {status ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {status}
        </Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={busy ? 'Finding projects' : 'Suggest scrap projects'}
        disabled={busy}
        onPress={() => {
          void onSuggest();
        }}
        style={({ pressed }) => [styles.suggest, busy && styles.disabled, pressed && styles.pressed, webCursor]}
      >
        <Text style={styles.suggestText}>{busy ? 'Finding projects…' : 'Suggest scrap projects'}</Text>
      </Pressable>

      {result ? (
        <View style={styles.results}>
          <Text style={styles.resultsTitle}>{result.source === 'local-ai' ? 'Local AI ideas' : 'Offline ideas'}</Text>
          {result.note ? <Text style={styles.note}>{result.note}</Text> : null}
          {result.ideas.map((idea) => (
            <View key={idea.title} style={styles.ideaCard}>
              <Text style={styles.ideaTitle}>{idea.title}</Text>
              <Text style={styles.ideaMeta}>
                {idea.estimatedYardage} · {idea.hookSize} · {difficultyLabel(idea.difficulty)}
              </Text>
              <Text style={styles.ideaBody}>{idea.colorPlacement}</Text>
            </View>
          ))}

          <Text style={styles.resultsTitle}>Catalog matches</Text>
          {result.patterns.length === 0 ? (
            <Text style={styles.note}>No small catalog patterns matched this yarn.</Text>
          ) : (
            result.patterns.map((pattern) => (
              <Pressable
                key={pattern.id}
                accessibilityRole="button"
                accessibilityLabel={`Open ${pattern.title}`}
                onPress={() => openCatalogPattern(pattern, onOpenPattern)}
                style={({ pressed }) => [styles.patternCard, pressed && styles.pressed, webCursor]}
              >
                <Text numberOfLines={2} style={styles.patternTitle}>
                  {pattern.title}
                </Text>
                <Text style={styles.ideaMeta}>
                  {pattern.creator} · {pattern.hookSize} · {difficultyLabel(pattern.difficulty)}
                </Text>
              </Pressable>
            ))
          )}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Save scanned leftover yarn"
            disabled={selected.length === 0}
            onPress={() => {
              onSaveToStash({
                colors: selected,
                yarnWeight: weight,
                yardageTier: tier,
                hookSize: result.ideas[0]?.hookSize ?? hookForYarnWeight(weight),
              });
            }}
            style={({ pressed }) => [styles.saveStash, pressed && styles.pressed, webCursor]}
          >
            <Text style={styles.saveStashText}>Save leftover to stash</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function openCatalogPattern(pattern: CrochetPattern, onOpenPattern: (patternId: string) => void) {
  const store = useCrochetStore.getState();
  const existing =
    store.patterns.find((item) => pattern.videoId.length > 0 && item.videoId === pattern.videoId) ??
    store.patterns.find((item) => item.id === pattern.id);
  if (existing) {
    onOpenPattern(existing.id);
    return;
  }
  const id = store.addPatternFromYouTube(
    {
      title: pattern.title,
      creator: pattern.creator,
      youtubeUrl: pattern.youtubeUrl,
      difficulty: pattern.difficulty,
      yarnWeight: pattern.yarnWeight,
      hookSize: pattern.hookSize,
      totalRows: pattern.totalRows,
      stitchesPerRow: pattern.stitchesPerRow,
      tags: pattern.tags,
      summary: pattern.summary,
      bookmarks: pattern.bookmarks,
      videoUrl: pattern.videoUrl,
      source: pattern.source,
      steps: pattern.steps,
    },
    pattern.id.length <= 80 ? pattern.id : undefined,
  );
  if (id) onOpenPattern(id);
}

function EngineCard({
  engine,
  progress,
  onDownload,
  onDelete,
}: {
  engine: EngineState;
  progress: number;
  onDownload: () => void;
  onDelete: () => void;
}) {
  if (engine === 'unsupported') {
    return (
      <View style={styles.engineCard}>
        <Text style={styles.engineTitle}>Offline scrap rules</Text>
        <Text style={styles.note}>
          Expo Go and web use the built-in project rules. A development build can run the local engine.
        </Text>
      </View>
    );
  }
  if (engine === 'ready') {
    return (
      <View style={styles.engineCard}>
        <Text style={styles.engineTitle}>Local AI engine ready</Text>
        <Text style={styles.note}>Suggestions run on this device. Remove the engine if you need the space back.</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Remove local AI engine"
          onPress={onDelete}
          style={({ pressed }) => [pressed && styles.pressed, webCursor]}
        >
          <Text style={styles.removeLabel}>Remove local AI engine</Text>
        </Pressable>
      </View>
    );
  }
  const percent = Math.round(Math.min(1, Math.max(0, progress)) * 100);
  return (
    <View style={styles.engineCard}>
      <Text style={styles.engineTitle}>{LOCAL_AI_ENGINE_LABEL}</Text>
      <Text style={styles.note}>
        {engine === 'downloading'
          ? `Downloading… ${percent}%`
          : 'Download once, then scrap suggestions run without a network.'}
      </Text>
      {engine === 'downloading' ? (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${percent}%` }]} />
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={LOCAL_AI_ENGINE_LABEL}
          onPress={onDownload}
          style={({ pressed }) => [styles.downloadButton, pressed && styles.pressed, webCursor]}
        >
          <Text style={styles.downloadText}>{LOCAL_AI_ENGINE_LABEL}</Text>
        </Pressable>
      )}
    </View>
  );
}

function difficultyLabel(value: string): string {
  if (value === 'beginner') return 'Beginner';
  if (value === 'intermediate') return 'Intermediate';
  if (value === 'advanced') return 'Advanced';
  return 'Easy';
}

function YarnBallIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="13" r="7" stroke={color} strokeWidth={1.6} />
      <Path d="M8 11c2.2 1 4.2 1 8 0M7.5 14c2.8 1 5.2 1 9 0" stroke={color} strokeWidth={1.4} strokeLinecap="round" />
      <Path d="M12 6c.4-1.4 1.4-2.2 2.6-2.4" stroke={color} strokeWidth={1.4} strokeLinecap="round" />
    </Svg>
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
    ...Typography.title,
    marginTop: -2,
    color: Colors.textPrimary,
  },
  form: {
    paddingHorizontal: Layout.screenGutter,
    paddingBottom: Spacing.lg,
    gap: Spacing.lg,
  },
  captureRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  captureButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: Spacing.sm,
    backgroundColor: Colors.elevatedControl,
    paddingHorizontal: Spacing.md,
  },
  captureLabel: {
    ...Typography.label,
    color: Colors.textPrimary,
  },
  preview: {
    width: '100%',
    height: 180,
    borderRadius: Radius.lg,
    backgroundColor: Colors.elevatedControl,
  },
  field: {
    gap: Spacing.sm,
  },
  label: {
    ...Typography.caption,
    color: Colors.textSecondary,
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
  engineCard: {
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.elevatedControl,
  },
  engineTitle: {
    ...Typography.subhead,
    color: Colors.textPrimary,
  },
  note: {
    ...Typography.callout,
    color: Colors.textSecondary,
  },
  progressTrack: {
    height: 8,
    borderRadius: Radius.pill,
    backgroundColor: Colors.cardSurface,
    overflow: 'hidden',
  },
  progressFill: {
    height: 8,
    borderRadius: Radius.pill,
    backgroundColor: Colors.accentPrimary,
  },
  downloadButton: {
    minHeight: 44,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accentPrimary,
    paddingHorizontal: Spacing.md,
  },
  downloadText: {
    ...Typography.label,
    color: Colors.onAccent,
    textAlign: 'center',
  },
  removeLabel: {
    ...Typography.caption,
    color: Colors.danger,
    fontWeight: FontWeight.semibold,
  },
  error: {
    ...Typography.callout,
    color: Colors.danger,
  },
  suggest: {
    minHeight: 48,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accentPrimary,
  },
  suggestText: {
    ...Typography.label,
    color: Colors.onAccent,
  },
  results: {
    gap: Spacing.md,
  },
  resultsTitle: {
    ...Typography.subhead,
    color: Colors.textPrimary,
  },
  ideaCard: {
    gap: Spacing.xs,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.elevatedControl,
  },
  ideaTitle: {
    ...Typography.label,
    color: Colors.textPrimary,
  },
  ideaMeta: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  ideaBody: {
    ...Typography.callout,
    color: Colors.textPrimary,
  },
  patternCard: {
    gap: Spacing.xs,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.cardSurface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  patternTitle: {
    ...Typography.label,
    color: Colors.textPrimary,
  },
  saveStash: {
    minHeight: 48,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.elevatedControl,
    borderWidth: 1,
    borderColor: Colors.accentPrimary,
  },
  saveStashText: {
    ...Typography.label,
    color: Colors.accentPrimary,
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.72,
  },
});
