/**
 * Leftover yarn: scan once on device, fill details, and show catalog projects.
 * Corrections are optional. Color is not part of this sheet.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Image, Keyboard, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { YarnScanLoading } from '@/components/YarnScanLoading';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useBottomSheetScrollRef } from '@/components/ui/BottomSheetScrollContext';
import { Colors, FontWeight, Layout, Radius, Spacing, Typography } from '@/constants/BambuTheme';
import { YARN_WEIGHTS, type CrochetPattern } from '@/store/useCrochetStore';
import { displayThumbnail, recommendationThumbnail } from '@/utils/catalogPreview';
import {
  applyVisionFindings,
  beginManualYarnFindings,
  confirmVisionFindings,
  editVisionCorrections,
  getLeftoverYarnDraft,
  replaceLeftoverPhoto,
  resetLeftoverYarnDraft,
  subscribeLeftoverYarnDraft,
  updateLeftoverYarnDraft,
  type VisionCorrections,
} from '@/utils/leftoverYarnDraft';
import { difficultyLabel, yarnWeightMeta } from '@/utils/patternDisplay';
import { captureErrorMessage, captureProgressPhoto, type CaptureSource } from '@/utils/progressPhoto';
import { hookRangeLabel } from '@/utils/scrapHookRange';
import { modelTransferStatusLabel } from '@/utils/scrapModelTransfer';
import { hookForYarnWeight, parseAvailableYards, tierForYards, type ScannedLeftoverDraft } from '@/utils/scrapYarnAi';
import { recommendScannedCatalog, type VisionCatalogCard } from '@/utils/scrapVisionCatalog';
import type { VisionScanDetail } from '@/utils/scrapVisionConfig';
import { prepareVisionPhoto } from '@/utils/scrapVisionImage';
import { QUANTITY_CATEGORIES, VISION_SUBJECTS, weightFromLabel, type QuantityCategory, type VisionSubject } from '@/utils/scrapVisionOutput';
import {
  analyzeLeftoverPhoto,
  cancelActiveVisionAnalysis,
  cancelVisionDownload,
} from '@/utils/scrapVisionRun';

type ScrapBusterModalProps = {
  visible: boolean;
  onClose: () => void;
  onDismiss?: () => void;
  onPreviewPattern: (pattern: CrochetPattern) => void;
  onSaveToStash: (draft: ScannedLeftoverDraft) => void;
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
            <Text style={styles.subtitle}>Scan your yarn to find projects you could make</Text>
          </View>
          {draft.photoUri ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Start a new yarn scan"
              testID="leftover-start-over"
              hitSlop={Layout.hitSlop}
              onPress={() => {
                cancelActiveVisionAnalysis();
                resetLeftoverYarnDraft();
              }}
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
      {visible ? <ScrapBusterForm key={draft.sessionEpoch} onPreviewPattern={onPreviewPattern} onSaveToStash={onSaveToStash} /> : null}
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
  const scrollRef = useBottomSheetScrollRef();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(draft.analysisSource === 'user' && !draft.confirmed);
  const mounted = useRef(true);
  // Synchronous guard: a double tap cannot queue a second multi-minute scan.
  const operation = useRef<symbol | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      operation.current = null;
      cancelActiveVisionAnalysis();
    };
  }, []);

  const refreshMatches = () => {
    const current = getLeftoverYarnDraft().corrections;
    if (!current) return;
    Keyboard.dismiss();
    confirmVisionFindings(recommendScannedCatalog(current));
    setDetailsOpen(false);
    updateLeftoverYarnDraft({ scrollY: 0 });
    scrollRef?.current?.scrollTo({ y: 0, animated: true });
  };

  const onAnalyze = async (detail: VisionScanDetail = 'quick') => {
    const source = getLeftoverYarnDraft();
    if (!source.photoUri || operation.current) return;
    const token = Symbol('scan');
    operation.current = token;
    const isCurrent = () => {
      const current = getLeftoverYarnDraft();
      return mounted.current && operation.current === token &&
        current.photoGeneration === source.photoGeneration && current.sessionEpoch === source.sessionEpoch;
    };
    setDetailsOpen(false);
    setMessage(null);
    setProgress(null);
    setBusy('Preparing your photo');
    try {
      const imageUri = await prepareVisionPhoto(source.photoUri, detail);
      if (!isCurrent()) return;
      const result = await analyzeLeftoverPhoto({
        imageUri,
        scanDetail: detail,
        photoGeneration: source.photoGeneration,
        isCurrent,
        onProgress: (update) => {
          if (!isCurrent()) return;
          setProgress(update.ratio);
          setBusy(modelTransferStatusLabel(update));
        },
        onPhase: (phase) => {
          if (!isCurrent()) return;
          setProgress(null);
          setBusy(phase === 'load' ? 'Getting ready to scan' : 'Scanning your yarn');
        },
      });
      if (!isCurrent()) return;
      if (result.status === 'findings') {
        if (applyVisionFindings(source.photoGeneration, result.findings)) refreshMatches();
      } else if (result.status === 'failed' || result.status === 'unsupported') {
        if (!result.message.includes('busy')) {
          beginManualYarnFindings();
          setDetailsOpen(true);
        }
        setMessage(result.message);
      } else if (result.status === 'cancelled') {
        setMessage('Scan cancelled. You can try again or enter yarn details.');
      }
    } catch (error) {
      if (__DEV__ && error instanceof Error) console.warn('[vision] analyze', error.message);
      if (isCurrent()) {
        beginManualYarnFindings();
        setDetailsOpen(true);
        setMessage('The scan could not finish. Enter any yarn details you know to see project ideas.');
      }
    } finally {
      if (operation.current === token) {
        operation.current = null;
        if (mounted.current) setBusy(null);
      }
    }
  };

  const onCapture = async (source: CaptureSource) => {
    if (operation.current) return;
    const token = Symbol('capture');
    operation.current = token;
    setMessage(null);
    try {
      const captured = await captureProgressPhoto(source);
      if (!mounted.current || operation.current !== token) return;
      if (captured.status === 'error') setMessage(captureErrorMessage(captured.reason, source));
      if (captured.status !== 'ok') return;
      replaceLeftoverPhoto(captured.uri);
      operation.current = null;
      await onAnalyze();
    } finally {
      if (operation.current === token) operation.current = null;
    }
  };

  const corrections = draft.corrections;
  const yards = parseAvailableYards(corrections?.yardsText ?? draft.yardsText);
  const hasResults = draft.confirmed && draft.catalog != null;

  return (
    <View style={styles.form}>
      {draft.photoUri ? (
        <View style={styles.block}>
          {busy ? (
            <YarnScanLoading photoUri={draft.photoUri} label={busy} progress={progress} />
          ) : (
            <Image accessible accessibilityLabel="Yarn photo" source={{ uri: draft.photoUri }} resizeMode="cover" style={[styles.photo, hasResults && styles.resultPhoto]} />
          )}
          {busy ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Cancel scan" onPress={() => {
              operation.current = null;
              cancelVisionDownload();
              setBusy(null);
              setMessage('Scan cancelled. You can try again or enter yarn details.');
            }} style={styles.textAction}>
              <Text style={styles.removeLabel}>Cancel scan</Text>
            </Pressable>
          ) : (
            <View style={styles.captureRow}>
              <Pressable accessibilityRole="button" accessibilityLabel="Retake photo" testID="leftover-retake" onPress={() => { void onCapture('camera'); }} style={styles.secondaryButton}>
                <Text style={styles.secondaryLabel}>Retake</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Change photo" testID="leftover-change-photo" onPress={() => { void onCapture('library'); }} style={styles.secondaryButton}>
                <Text style={styles.secondaryLabel}>Change photo</Text>
              </Pressable>
            </View>
          )}
          {!busy && !corrections ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Scan photo" testID="leftover-analyze" onPress={() => { void onAnalyze(); }} style={styles.primaryButton}>
              <Text style={styles.primaryLabel}>Scan photo</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View style={styles.block}>
          <Pressable accessibilityRole="button" accessibilityLabel="Take photo" testID="leftover-take-photo" onPress={() => { void onCapture('camera'); }} style={styles.primaryButton}>
            <YarnBallIcon color={Colors.onAccent} />
            <Text style={styles.primaryLabel}>Take photo</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Choose photo" testID="leftover-choose-photo" onPress={() => { void onCapture('library'); }} style={styles.secondaryButton}>
            <Text style={styles.secondaryLabel}>Choose photo</Text>
          </Pressable>
        </View>
      )}

      {message ? <Text accessibilityLiveRegion="polite" style={styles.error}>{message}</Text> : null}

      {!busy && hasResults && !detailsOpen ? (
        <View style={styles.results} testID="leftover-matching-results">
          <Text style={styles.resultsTitle}>Matching projects</Text>
          {corrections ? (
            <Text style={styles.note}>
              {corrections.yarnCategory === 'uncertain' ? 'Yarn thickness unknown' : `${yarnWeightMeta(corrections.yarnCategory).label} · ${corrections.categorySource === 'label' ? 'from label' : 'estimated or selected'}`}
              {' · '}{yards > 0 ? `${yards} yd entered` : corrections.quantityCategory === 'uncertain' ? 'Amount unknown' : `${quantityLabel(corrections.quantityCategory)} estimated`}
            </Text>
          ) : null}
          {draft.catalogNote ? <Text style={styles.note}>{draft.catalogNote}</Text> : null}
          <Pressable accessibilityRole="button" accessibilityLabel="Edit yarn details" testID="leftover-edit-details" onPress={() => setDetailsOpen(true)} style={styles.textAction}>
            <Text style={styles.accentLabel}>Edit yarn details</Text>
          </Pressable>
          {draft.catalog?.map((item) => <CatalogCard key={item.pattern.id} item={item} onPreview={() => onPreviewPattern(item.pattern)} />)}
          {draft.catalog?.length === 0 ? <Text style={styles.note}>No matching project was found. Try a clearer photo or adjust the details.</Text> : null}
        </View>
      ) : null}

      {!busy && corrections && detailsOpen ? (
        <View style={styles.block}>
          <FindingsEditor corrections={corrections} source={draft.analysisSource} onConfirm={refreshMatches} />
          <Pressable accessibilityRole="button" accessibilityLabel="Scan with more detail" onPress={() => {
            // Explicitly allow a rescan to replace previously corrected findings.
            updateLeftoverYarnDraft({ findingsEdited: false });
            void onAnalyze('detailed');
          }} style={styles.secondaryButton}>
            <Text style={styles.accentLabel}>Scan with more detail</Text>
          </Pressable>
          <Text style={styles.note}>Uses the original photo at higher detail and may take longer.</Text>
          {corrections.yarnCategory !== 'uncertain' && (yards > 0 || corrections.quantityCategory !== 'uncertain') ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Save leftover to stash" onPress={() => {
              if (corrections.yarnCategory === 'uncertain') return;
              const available = yards > 0 ? yards : categoryYards(corrections.quantityCategory);
              onSaveToStash({ colors: [], yarnWeight: corrections.yarnCategory, yardageTier: tierForYards(available), availableYards: available, hookSize: hookForYarnWeight(corrections.yarnCategory) });
            }} style={styles.secondaryButton}>
              <Text style={styles.accentLabel}>Save leftover to stash</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {!busy && draft.photoUri && !corrections ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Enter yarn details" onPress={() => { beginManualYarnFindings(); setDetailsOpen(true); }} style={styles.textAction}>
          <Text style={styles.accentLabel}>Enter yarn details</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function FindingsEditor({ corrections, source, onConfirm }: {
  corrections: VisionCorrections;
  source: 'vision' | 'user' | null;
  onConfirm: () => void;
}) {
  return (
    <View style={styles.block}>
      <Text style={styles.resultsTitle}>Yarn details</Text>
      <Text style={styles.note}>
        {source === 'vision'
          ? 'Filled from the photo. Estimates can be corrected here.'
          : 'Enter any details you know. Unknown details can stay blank.'}
      </Text>
      <Text style={styles.label}>What is in the photo</Text>
      <View style={styles.chips}>
        {VISION_SUBJECTS.map((subject) => (
          <Chip
            key={subject}
            label={subjectLabel(subject)}
            selected={corrections.subjects.includes(subject)}
            onPress={() => editVisionCorrections({ subjects: toggleSubject(corrections.subjects, subject) })}
          />
        ))}
      </View>
      <Text style={styles.label}>Yarn category</Text>
      <Text style={styles.note}>{categorySourceCopy(corrections)}</Text>
      <View style={styles.chips}>
        <Chip
          label="Uncertain"
          selected={corrections.yarnCategory === 'uncertain'}
          onPress={() => editVisionCorrections({ yarnCategory: 'uncertain', categorySource: 'uncertain' })}
        />
        {YARN_WEIGHTS.map((weight) => {
          const meta = yarnWeightMeta(weight);
          return (
            <Chip
              key={weight}
              label={`${meta.label} ${meta.number}`}
              selected={corrections.yarnCategory === weight}
              onPress={() =>
                editVisionCorrections({
                  yarnCategory: weight,
                  categorySource: weightFromLabel(corrections.labelText) === weight ? 'label' : 'visual',
                })
              }
            />
          );
        })}
      </View>
      <Text style={styles.label}>Label text</Text>
      <TextInput
        accessibilityLabel="Label text"
        value={corrections.labelText ?? ''}
        onChangeText={(value) => {
          const labeled = weightFromLabel(value);
          editVisionCorrections({
            labelText: value.trim() ? value : null,
            ...(labeled ? { yarnCategory: labeled, categorySource: 'label' as const } : {}),
          });
        }}
        style={styles.yardsInput}
      />
      <Text style={styles.label}>Marking on the hook</Text>
      <TextInput
        accessibilityLabel="Marking on the hook"
        value={corrections.hookObservedMarking ?? ''}
        onChangeText={(value) => editVisionCorrections({ hookObservedMarking: value.trim() ? value.trim() : null })}
        style={styles.yardsInput}
      />
      {corrections.hookObservedMarking ? <Text style={styles.note}>Observed marking: {corrections.hookObservedMarking}</Text> : null}
      {corrections.yarnCategory !== 'uncertain' ? (
        <Text style={styles.note}>Suggested hook for this yarn: {hookRangeLabel(corrections.yarnCategory)}</Text>
      ) : null}
      <Text style={styles.label}>Stitches</Text>
      {corrections.stitches === 'uncertain' ? (
        <Text style={styles.note}>Stitches are uncertain.</Text>
      ) : (
        corrections.stitches.map((stitch) => (
          <Text key={stitch.name} style={styles.note}>
            {stitch.name} ({stitch.confidence}
            {stitch.alternatives.length > 0 ? `; also ${stitch.alternatives.join(', ')}` : ''})
          </Text>
        ))
      )}
      {corrections.stitches !== 'uncertain' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mark stitches uncertain"
          onPress={() => editVisionCorrections({ stitches: 'uncertain' })}
          style={({ pressed }) => [styles.textAction, pressed && styles.pressed, webCursor]}
        >
          <Text style={styles.accentLabel}>Mark stitches uncertain</Text>
        </Pressable>
      ) : null}
      <Text style={styles.label}>Leftover amount</Text>
      <Text style={styles.note}>A photo cannot measure grams or yards. Pick a rough amount, or type what you know.</Text>
      <View style={styles.chips}>
        {QUANTITY_CATEGORIES.map((category) => (
          <Chip
            key={category}
            label={quantityLabel(category)}
            selected={corrections.quantityCategory === category}
            onPress={() => editVisionCorrections({ quantityCategory: category })}
          />
        ))}
      </View>
      <Text style={styles.label}>Grams, if you know them</Text>
      <TextInput
        accessibilityLabel="Grams"
        keyboardType="number-pad"
        inputMode="numeric"
        value={corrections.gramsText}
        onChangeText={(gramsText) => editVisionCorrections({ gramsText })}
        style={styles.yardsInput}
      />
      <Text style={styles.label}>Yards, if you know them</Text>
      <TextInput
        accessibilityLabel="Yards"
        keyboardType="number-pad"
        inputMode="numeric"
        value={corrections.yardsText}
        onChangeText={(yardsText) => editVisionCorrections({ yardsText })}
        style={styles.yardsInput}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="View matching projects"
        testID="leftover-confirm"
        onPress={onConfirm}
        style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, webCursor]}
      >
        <Text style={styles.primaryLabel}>View matching projects</Text>
      </Pressable>

    </View>
  );
}

function CatalogCard({ item, onPreview }: { item: VisionCatalogCard; onPreview: () => void }) {
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
        <Text style={styles.note}>{item.reason}</Text>
        <Text style={styles.note}>{item.yardageNote}</Text>
        <Text style={styles.note}>{item.materialsNote}</Text>
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
  return <Image accessible={false} source={{ uri }} style={styles.thumb} onError={() => setFailed(true)} />;
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.pressed, webCursor]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function toggleSubject(subjects: readonly VisionSubject[], subject: VisionSubject): VisionSubject[] {
  const has = subjects.includes(subject);
  const next = has ? subjects.filter((item) => item !== subject) : [...subjects.filter((item) => item !== 'none' && item !== 'uncertain'), subject];
  return next.length > 0 ? next : ['uncertain'];
}

function subjectLabel(subject: VisionSubject): string {
  if (subject === 'loose-yarn') return 'Loose yarn';
  if (subject === 'fabric') return 'Crocheted fabric';
  if (subject === 'hook') return 'Hook';
  if (subject === 'label') return 'Yarn label';
  if (subject === 'none') return 'No yarn';
  return 'Uncertain';
}

function quantityLabel(category: QuantityCategory): string {
  if (category === 'under-25') return 'Under 25 yd';
  if (category === '25-75') return '25–75 yd';
  if (category === '75-150') return '75–150 yd';
  if (category === 'skein-or-more') return 'About a skein or more';
  return 'Uncertain';
}

function categorySourceCopy(corrections: VisionCorrections): string {
  if (corrections.categorySource === 'label') return 'Yarn category came from the readable label.';
  if (corrections.categorySource === 'visual') return 'Yarn category is a visual estimate.';
  return 'Yarn category is uncertain.';
}

function categoryYards(category: QuantityCategory): number {
  if (category === 'under-25') return 25;
  if (category === '25-75') return 75;
  if (category === '75-150') return 150;
  if (category === 'skein-or-more') return 400;
  return 0;
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
  photo: {
    width: '100%',
    height: 220,
    borderRadius: Radius.lg,
    backgroundColor: Colors.elevatedControl,
  },
  resultPhoto: { height: 112 },
  note: {
    ...Typography.caption,
    color: Colors.textSecondary,
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
  ideaMeta: {
    ...Typography.caption,
    color: Colors.textSecondary,
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
