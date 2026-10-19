/**
 * Leftover yarn scanner. The photo and confirmed colors live in the in-memory
 * draft so a pattern preview can close this sheet and come back.
 * Suggestions come from the on-device model when it is downloaded, otherwise
 * from the offline scrap rules.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { YarnColorSwatchPicker } from '@/components/YarnColorSwatchPicker';
import { YarnRegionSelector } from '@/components/YarnRegionSelector';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Colors, FontWeight, Layout, Radius, Spacing, Typography } from '@/constants/BambuTheme';
import { YARN_WEIGHTS, type CrochetPattern } from '@/store/useCrochetStore';
import {
  displayThumbnail,
  recommendationThumbnail,
} from '@/utils/catalogPreview';
import {
  commitSampledColors,
  editLeftoverColors,
  getLeftoverYarnDraft,
  replaceLeftoverPhoto,
  resetLeftoverYarnDraft,
  setLeftoverImageSize,
  setLeftoverRegions,
  subscribeLeftoverYarnDraft,
  updateLeftoverYarnDraft,
} from '@/utils/leftoverYarnDraft';
import { difficultyLabel, yarnWeightMeta } from '@/utils/patternDisplay';
import { captureErrorMessage, captureProgressPhoto, type CaptureSource } from '@/utils/progressPhoto';
import {
  LOCAL_AI_ENGINE_LABEL,
  YARDAGE_TIERS,
  analyzeLeftoverYarnAndSuggest,
  cancelScrapModelDownload,
  deleteScrapModel,
  downloadScrapModel,
  hookForYarnWeight,
  isLocalScrapAiSupported,
  isScrapModelDownloaded,
  offlineScrapSuggestion,
  parseAvailableYards,
  tierForYards,
  type ModelDownloadProgress,
  type ScannedLeftoverDraft,
  type ScrapCatalogSuggestion,
} from '@/utils/scrapYarnAi';
import { formatYarnColorLabel } from '@/utils/yarnColorExtractor';

type ScrapBusterModalProps = {
  visible: boolean;
  onClose: () => void;
  onDismiss?: () => void;
  onPreviewPattern: (pattern: CrochetPattern) => void;
  onSaveToStash: (draft: ScannedLeftoverDraft) => void;
};

type EngineState = 'checking' | 'unsupported' | 'missing' | 'downloading' | 'verifying' | 'ready';

type EngineCache = {
  engine: EngineState;
  progress: ModelDownloadProgress | null;
  canCancel: boolean;
};

let regionSerial = 0;
let engineCache: EngineCache = {
  engine: isLocalScrapAiSupported() ? 'checking' : 'unsupported',
  progress: null,
  canCancel: false,
};

function useLeftoverYarnDraft() {
  return useSyncExternalStore(subscribeLeftoverYarnDraft, getLeftoverYarnDraft, getLeftoverYarnDraft);
}

export function ScrapBusterModal({ visible, onClose, onDismiss, onPreviewPattern, onSaveToStash }: ScrapBusterModalProps) {
  const draft = useLeftoverYarnDraft();
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      onDismiss={onDismiss}
      initialScrollOffset={draft.scrollY}
      onScrollOffsetChange={(offset) => updateLeftoverYarnDraft({ scrollY: offset })}
      header={
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text role="heading" aria-level={2} style={styles.title}>
              Leftover yarn
            </Text>
            <Text style={styles.subtitle}>Photo, yarn colors, then a project that fits</Text>
          </View>
          {draft.photoUri ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Start a new yarn scan"
              testID="leftover-start-over"
              hitSlop={Layout.hitSlop}
              onPress={() => resetLeftoverYarnDraft()}
              style={({ pressed }) => [styles.textAction, pressed && styles.pressed, webCursor]}
            >
              <Text style={styles.textActionLabel}>Start over</Text>
            </Pressable>
          ) : null}
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
      }
    >
      {visible ? (
        <ScrapBusterForm onPreviewPattern={onPreviewPattern} onSaveToStash={onSaveToStash} />
      ) : null}
    </BottomSheet>
  );
}

function ScrapBusterForm({
  onPreviewPattern,
  onSaveToStash,
}: {
  onPreviewPattern: (pattern: CrochetPattern) => void;
  onSaveToStash: (draft: ScannedLeftoverDraft) => void;
}) {
  const draft = useLeftoverYarnDraft();
  const [engine, setEngine] = useState<EngineState>(engineCache.engine);
  const [progress, setProgress] = useState<ModelDownloadProgress | null>(engineCache.progress);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [canCancelDownload, setCanCancelDownload] = useState(engineCache.canCancel);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const yards = parseAvailableYards(draft.yardsText);
  const colorKey = draft.colors.map((color) => `${color.name}:${color.hex}`).join('|');
  const inputKey = `${colorKey}|${draft.weight}|${yards}`;
  const offline = useMemo(
    () => offlineScrapSuggestion({ colors: draft.colors, weight: draft.weight, availableYards: yards }),
    [draft.colors, draft.weight, yards],
  );
  const shown =
    draft.aiResult && draft.aiResult.key === inputKey && !draft.aiResult.result.discarded
      ? draft.aiResult.result
      : offline;

  useEffect(() => {
    engineCache = { engine, progress, canCancel: canCancelDownload };
  }, [canCancelDownload, engine, progress]);

  useEffect(() => {
    if (!isLocalScrapAiSupported()) return undefined;
    if (engineCache.engine === 'downloading' || engineCache.engine === 'verifying') return undefined;
    let alive = true;
    void isScrapModelDownloaded((update) => {
      if (!alive) return;
      setEngine('verifying');
      setProgress(update);
    }).then((ready) => {
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
    replaceLeftoverPhoto(captured.uri);
  };

  const onDownload = async () => {
    setEngine('downloading');
    setCanCancelDownload(true);
    setProgress({ phase: 'download', written: 0, total: 1, ratio: 0 });
    setStatus(null);
    try {
      await downloadScrapModel((update) => {
        setProgress(update);
        if (update.phase === 'verify') setEngine('verifying');
      });
      setEngine('ready');
      setProgress({ phase: 'verify', written: 1, total: 1, ratio: 1 });
    } catch (error) {
      setEngine('missing');
      setProgress(null);
      if (error instanceof Error && error.name === 'ScrapTransferCancelledError') {
        setStatus('Download cancelled.');
        return;
      }
      setStatus(error instanceof Error ? error.message : 'The local AI engine could not be downloaded.');
    } finally {
      setCanCancelDownload(false);
    }
  };

  const onDeleteEngine = async () => {
    try {
      await deleteScrapModel();
      setEngine('missing');
      setProgress(null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'The local AI engine could not be removed.');
    }
  };

  const onPersonalize = async () => {
    if (!draft.photoUri || draft.colors.length === 0 || yards <= 0 || busy) {
      if (!draft.photoUri) setStatus('Add a photo of the leftover yarn first.');
      else if (draft.colors.length === 0) setStatus('Select the yarn, then keep at least one color.');
      else if (yards <= 0) setStatus('Enter how many yards you have.');
      return;
    }
    const epoch = draft.sessionEpoch;
    const key = inputKey;
    setBusy(true);
    setStatus(null);
    try {
      const next = await analyzeLeftoverYarnAndSuggest({
        imageUri: draft.photoUri,
        colors: draft.colors.map((color) => formatYarnColorLabel(color)),
        weight: draft.weight,
        yardageTier: tierForYards(yards),
        availableYards: yards,
      });
      const current = getLeftoverYarnDraft();
      const currentKey = `${current.colors.map((color) => `${color.name}:${color.hex}`).join('|')}|${current.weight}|${parseAvailableYards(current.yardsText)}`;
      if (current.sessionEpoch !== epoch || currentKey !== key || next.discarded) return;
      updateLeftoverYarnDraft({ aiResult: { key, result: next } });
    } catch {
      if (getLeftoverYarnDraft().sessionEpoch === epoch) setStatus('Could not build suggestions. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.form}>
      {draft.photoUri ? (
        <View style={styles.block}>
          <YarnRegionSelector
            imageUri={draft.photoUri}
            imageWidth={draft.imageWidth}
            imageHeight={draft.imageHeight}
            regions={draft.regions}
            onImageSize={setLeftoverImageSize}
            onRegionsCommit={setLeftoverRegions}
            onCreateId={() => {
              regionSerial += 1;
              return `yarn-${getLeftoverYarnDraft().photoGeneration}-${regionSerial}`;
            }}
          />
          <View style={styles.captureRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retake photo"
              testID="leftover-retake"
              onPress={() => {
                void onCapture('camera');
              }}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed, webCursor]}
            >
              <Text style={styles.secondaryLabel}>Retake</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Change photo"
              testID="leftover-change-photo"
              onPress={() => {
                void onCapture('library');
              }}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed, webCursor]}
            >
              <Text style={styles.secondaryLabel}>Change photo</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.block}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Take photo"
            testID="leftover-take-photo"
            onPress={() => {
              void onCapture('camera');
            }}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, webCursor]}
          >
            <YarnBallIcon color={Colors.onAccent} />
            <Text style={styles.primaryLabel}>Take photo</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose photo"
            testID="leftover-choose-photo"
            onPress={() => {
              void onCapture('library');
            }}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed, webCursor]}
          >
            <Text style={styles.secondaryLabel}>Choose photo</Text>
          </Pressable>
        </View>
      )}

      {draft.photoUri && draft.regions.length > 0 ? (
        <View style={styles.block}>
          <Text style={styles.label}>Yarn colors</Text>
          <YarnColorSwatchPicker
            imageUri={draft.photoUri}
            imageWidth={draft.imageWidth}
            imageHeight={draft.imageHeight}
            regions={draft.regions}
            photoGeneration={draft.photoGeneration}
            colors={draft.colors}
            sampledKey={draft.sampledKey}
            onEditColors={editLeftoverColors}
            onSampled={(stamp, next) => {
              commitSampledColors(stamp, next);
            }}
          />
        </View>
      ) : null}

      {draft.photoUri && draft.regions.length > 0 ? (
        <View style={styles.block}>
          <Text style={styles.label}>Weight</Text>
          <View style={styles.chips}>
            {YARN_WEIGHTS.map((option) => {
              const meta = yarnWeightMeta(option);
              const active = draft.weight === option;
              return (
                <Pressable
                  key={option}
                  accessibilityRole="button"
                  accessibilityLabel={`${meta.label} ${meta.number}`}
                  accessibilityState={{ selected: active }}
                  onPress={() => updateLeftoverYarnDraft({ weight: option })}
                  style={({ pressed }) => [styles.chip, active && styles.chipSelected, pressed && styles.pressed, webCursor]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextSelected]}>
                    {meta.label} {meta.number}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.label}>Yards</Text>
          <TextInput
            accessibilityLabel="Yards"
            keyboardType="number-pad"
            inputMode="numeric"
            value={draft.yardsText}
            onChangeText={(yardsText) => updateLeftoverYarnDraft({ yardsText })}
            style={styles.yardsInput}
          />
          <View style={styles.chips}>
            {YARDAGE_TIERS.map((option) => {
              const active = draft.yardsText === String(option.yards);
              return (
                <Pressable
                  key={option.id}
                  accessibilityRole="button"
                  accessibilityLabel={option.label}
                  accessibilityState={{ selected: active }}
                  onPress={() => updateLeftoverYarnDraft({ yardsText: String(option.yards) })}
                  style={({ pressed }) => [styles.chip, active && styles.chipSelected, pressed && styles.pressed, webCursor]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextSelected]}>{yardChipLabel(option.id)}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {status ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {status}
        </Text>
      ) : null}

      {draft.colors.length > 0 && yards > 0 ? (
        <View style={styles.results}>
          {engine === 'ready' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={busy ? 'Personalizing projects' : 'Personalize colors'}
              disabled={busy}
              onPress={() => {
                void onPersonalize();
              }}
              style={({ pressed }) => [styles.primaryButton, busy && styles.disabled, pressed && styles.pressed, webCursor]}
            >
              <Text style={styles.primaryLabel}>{busy ? 'Personalizing…' : 'Personalize colors'}</Text>
            </Pressable>
          ) : null}

          <Text style={styles.resultsTitle}>{shown.source === 'local-ai' ? 'Personalized ideas' : 'Ideas'}</Text>
          {shown.ideas.length === 0 ? (
            <Text style={styles.note}>No planning estimate fits in {yards} yd.</Text>
          ) : (
            shown.ideas.map((idea) => (
              <View key={idea.planId} style={styles.ideaCard}>
                <View style={styles.ideaSwatches}>
                  {draft.colors.map((color) => (
                    <View key={color.hex} style={[styles.swatch, { backgroundColor: color.hex }]} />
                  ))}
                </View>
                <View style={styles.ideaCopy}>
                  <Text style={styles.ideaTitle}>{idea.title}</Text>
                  <Text style={styles.ideaMeta}>
                    {difficultyLabel(idea.difficulty)} · {idea.hookSize}
                  </Text>
                  <Text style={styles.note}>Planning estimate: {idea.estimatedYardage}</Text>
                  <Text style={styles.ideaBody}>{idea.colorPlacement}</Text>
                </View>
              </View>
            ))
          )}

          <Text style={styles.resultsTitle}>Tutorials</Text>
          {shown.catalog.length === 0 ? (
            <Text style={styles.note}>No tutorial fits this weight and yard total.</Text>
          ) : (
            shown.catalog.map((item) => (
              <CatalogCard key={item.pattern.id} item={item} onPreview={() => onPreviewPattern(item.pattern)} />
            ))
          )}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Save leftover to stash"
            onPress={() => {
              onSaveToStash({
                colors: draft.colors,
                yarnWeight: draft.weight,
                yardageTier: tierForYards(yards),
                availableYards: yards,
                hookSize: shown.ideas[0]?.hookSize ?? hookForYarnWeight(draft.weight),
              });
            }}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed, webCursor]}
          >
            <Text style={styles.accentLabel}>Save leftover to stash</Text>
          </Pressable>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: settingsOpen }}
        accessibilityLabel="On-device suggestions"
        onPress={() => setSettingsOpen((open) => !open)}
        style={({ pressed }) => [styles.settingsHeader, pressed && styles.pressed, webCursor]}
      >
        <Text style={styles.settingsTitle}>On-device suggestions</Text>
        <Text style={styles.note}>{settingsOpen ? 'Hide' : 'Show'}</Text>
      </Pressable>
      {settingsOpen ? (
        <EngineCard
          engine={engine}
          progress={progress}
          canCancel={canCancelDownload}
          onDownload={() => {
            void onDownload();
          }}
          onCancel={() => cancelScrapModelDownload()}
          onDelete={() => {
            void onDeleteEngine();
          }}
        />
      ) : null}
    </View>
  );
}

function CatalogCard({ item, onPreview }: { item: ScrapCatalogSuggestion; onPreview: () => void }) {
  const pattern = item.pattern;
  const weight = yarnWeightMeta(pattern.yarnWeight);
  return (
    <View style={styles.patternCard}>
      <CatalogThumb pattern={pattern} />
      <View style={styles.patternCopy}>
        <Text numberOfLines={2} style={styles.patternTitle}>
          {pattern.title}
        </Text>
        <Text numberOfLines={1} style={styles.ideaMeta}>
          {pattern.creator} · {difficultyLabel(pattern.difficulty)}
        </Text>
        <Text numberOfLines={1} style={styles.ideaMeta}>
          {weight.label} {weight.number} · {pattern.hookSize}
        </Text>
        <Text style={styles.note}>{item.yardageNote}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Preview ${pattern.title}`}
          testID={`leftover-preview-${pattern.id}`}
          onPress={onPreview}
          style={({ pressed }) => [styles.previewButton, pressed && styles.pressed, webCursor]}
        >
          <Text style={styles.accentLabel}>Preview</Text>
        </Pressable>
      </View>
    </View>
  );
}

function CatalogThumb({ pattern }: { pattern: CrochetPattern }) {
  const thumb = recommendationThumbnail(pattern);
  const [failed, setFailed] = useState(false);
  const uri = displayThumbnail(thumb.uri, failed);
  if (!uri) {
    return (
      <View style={styles.thumbFallback}>
        <YarnBallIcon color={Colors.accentPrimary} />
      </View>
    );
  }
  return (
    <Image
      accessible={false}
      source={{ uri }}
      style={styles.thumb}
      onError={() => setFailed(true)}
    />
  );
}

function yardChipLabel(id: string): string {
  if (id === 'scrap_under_25yd') return '< 25 yd';
  if (id === 'small_25_75yd') return '25–75 yd';
  return '75–150 yd';
}

function EngineCard({
  engine,
  progress,
  canCancel,
  onDownload,
  onCancel,
  onDelete,
}: {
  engine: EngineState;
  progress: ModelDownloadProgress | null;
  canCancel: boolean;
  onDownload: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  if (engine === 'unsupported') {
    return (
      <View style={styles.engineCard}>
        <Text style={styles.note}>This device uses the built-in project list. A development build can run on-device personalization.</Text>
      </View>
    );
  }
  if (engine === 'ready') {
    return (
      <View style={styles.engineCard}>
        <Text style={styles.note}>Personalization is on this device and does not see the photo.</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Remove on-device suggestions"
          onPress={onDelete}
          style={({ pressed }) => [styles.textAction, pressed && styles.pressed, webCursor]}
        >
          <Text style={styles.removeLabel}>Remove download</Text>
        </Pressable>
      </View>
    );
  }
  const ratio = progress?.ratio ?? 0;
  const percent = Math.round(Math.min(1, Math.max(0, ratio)) * 100);
  const transferring = engine === 'downloading' || engine === 'verifying';
  const phaseLabel = progress?.phase === 'verify' || engine === 'verifying' ? 'Checking download' : 'Downloading';
  return (
    <View style={styles.engineCard}>
      <Text style={styles.note}>
        {transferring
          ? `${phaseLabel}… ${percent}%`
          : engine === 'checking'
            ? 'Checking for a saved download…'
            : 'Download once for on-device color placement. Ideas above do not need it.'}
      </Text>
      {transferring ? (
        <View style={styles.progressBlock}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${percent}%` }]} />
          </View>
          {canCancel ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel download"
              onPress={onCancel}
              style={({ pressed }) => [pressed && styles.pressed, webCursor]}
            >
              <Text style={styles.removeLabel}>Cancel download</Text>
            </Pressable>
          ) : null}
        </View>
      ) : engine === 'checking' ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={LOCAL_AI_ENGINE_LABEL}
          onPress={onDownload}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, webCursor]}
        >
          <Text style={styles.primaryLabel}>{LOCAL_AI_ENGINE_LABEL}</Text>
        </Pressable>
      )}
    </View>
  );
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
    alignItems: 'center',
    gap: Spacing.sm,
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
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  textAction: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
  },
  textActionLabel: {
    ...Typography.caption,
    color: Colors.accentPrimary,
  },
  closeButton: {
    width: 44,
    height: 44,
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
  block: {
    gap: Spacing.sm,
  },
  captureRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: Spacing.sm,
    backgroundColor: Colors.accentPrimary,
    paddingHorizontal: Spacing.md,
  },
  primaryLabel: {
    ...Typography.label,
    color: Colors.onAccent,
    textAlign: 'center',
  },
  secondaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.elevatedControl,
    paddingHorizontal: Spacing.md,
  },
  secondaryLabel: {
    ...Typography.label,
    color: Colors.textPrimary,
  },
  accentLabel: {
    ...Typography.label,
    color: Colors.accentPrimary,
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
    minHeight: 44,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
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
  yardsInput: {
    ...Typography.body,
    color: Colors.textPrimary,
    backgroundColor: Colors.cardSurface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    minHeight: 44,
  },
  settingsHeader: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingsTitle: {
    ...Typography.label,
    color: Colors.textPrimary,
  },
  engineCard: {
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.elevatedControl,
  },
  note: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  progressBlock: {
    gap: Spacing.sm,
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
  removeLabel: {
    ...Typography.caption,
    color: Colors.danger,
    fontWeight: FontWeight.semibold,
  },
  error: {
    ...Typography.callout,
    color: Colors.danger,
  },
  results: {
    gap: Spacing.md,
  },
  resultsTitle: {
    ...Typography.subhead,
    color: Colors.textPrimary,
  },
  ideaCard: {
    flexDirection: 'row',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.elevatedControl,
  },
  ideaSwatches: {
    width: 72,
    gap: Spacing.xs,
    justifyContent: 'center',
  },
  swatch: {
    height: 18,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  ideaCopy: {
    flex: 1,
    gap: Spacing.xs,
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
    flexDirection: 'row',
    gap: Spacing.md,
    padding: Spacing.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.cardSurface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  thumb: {
    width: 96,
    height: 72,
    borderRadius: Radius.sm,
    backgroundColor: Colors.elevatedControl,
  },
  thumbFallback: {
    width: 96,
    height: 72,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.elevatedControl,
  },
  patternCopy: {
    flex: 1,
    gap: Spacing.xs,
  },
  patternTitle: {
    ...Typography.label,
    color: Colors.textPrimary,
  },
  previewButton: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    paddingRight: Spacing.md,
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.72,
  },
});
