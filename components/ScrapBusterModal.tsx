/**
 * Leftover yarn. A photo is analyzed on device, then the maker confirms
 * the findings and opens matching tutorials. Color is not part of this sheet.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { BottomSheet } from '@/components/ui/BottomSheet';
import { Colors, FontWeight, Layout, Radius, Spacing, Typography } from '@/constants/BambuTheme';
import type { PatternDifficulty } from '@/store/machine';
import { YARN_WEIGHTS, type CrochetPattern } from '@/store/useCrochetStore';
import { displayThumbnail, recommendationThumbnail } from '@/utils/catalogPreview';
import {
  applyVisionFindings,
  beginManualYarnFindings,
  confirmVisionFindings,
  editVisionCorrections,
  getLeftoverYarnDraft,
  patternRequestFromDraft,
  replaceLeftoverPhoto,
  resetLeftoverYarnDraft,
  storePatternDraft,
  subscribeLeftoverYarnDraft,
  updateLeftoverYarnDraft,
  updatePatternRequest,
  type VisionCorrections,
} from '@/utils/leftoverYarnDraft';
import { difficultyLabel, yarnWeightMeta } from '@/utils/patternDisplay';
import { captureErrorMessage, captureProgressPhoto, type CaptureSource } from '@/utils/progressPhoto';
import { hookRangeLabel } from '@/utils/scrapHookRange';
import { hookForYarnWeight, parseAvailableYards, tierForYards, type ScannedLeftoverDraft } from '@/utils/scrapYarnAi';
import { recommendConfirmedCatalog, type VisionCatalogCard } from '@/utils/scrapVisionCatalog';
import { prepareVisionPhoto } from '@/utils/scrapVisionImage';
import { QUANTITY_CATEGORIES, VISION_SUBJECTS, weightFromLabel, type QuantityCategory, type VisionSubject } from '@/utils/scrapVisionOutput';
import {
  analyzeLeftoverPhoto,
  cancelActiveVisionAnalysis,
  cancelVisionDownload,
  createLeftoverPatternDraft,
} from '@/utils/scrapVisionRun';

type ScrapBusterModalProps = {
  visible: boolean;
  onClose: () => void;
  onDismiss?: () => void;
  onPreviewPattern: (pattern: CrochetPattern) => void;
  onSaveToStash: (draft: ScannedLeftoverDraft) => void;
};

const SKILLS: readonly PatternDifficulty[] = ['beginner', 'easy', 'intermediate', 'advanced'];

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
            <Text style={styles.subtitle}>Take a photo, confirm the findings, then open matching tutorials</Text>
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
      {visible ? <ScrapBusterForm onPreviewPattern={onPreviewPattern} onSaveToStash={onSaveToStash} /> : null}
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
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [ratio, setRatio] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const onCapture = async (source: CaptureSource) => {
    cancelActiveVisionAnalysis();
    setMessage(null);
    setBusy(null);
    const captured = await captureProgressPhoto(source);
    if (!mounted.current || captured.status === 'canceled') return;
    if (captured.status === 'error') {
      setMessage(captureErrorMessage(captured.reason, source));
      return;
    }
    replaceLeftoverPhoto(captured.uri);
  };

  const onAnalyze = async () => {
    const photoUri = getLeftoverYarnDraft().photoUri;
    if (!photoUri || busy) return;
    const generation = getLeftoverYarnDraft().photoGeneration;
    const epoch = getLeftoverYarnDraft().sessionEpoch;
    const isCurrent = () => {
      const current = getLeftoverYarnDraft();
      return current.photoGeneration === generation && current.sessionEpoch === epoch;
    };
    setMessage(null);
    setRatio(0);
    setBusy('Preparing the photo');
    try {
      const imageUri = await prepareVisionPhoto(photoUri);
      if (!isCurrent()) return;
      const result = await analyzeLeftoverPhoto({
        imageUri,
        photoGeneration: generation,
        isCurrent,
        onProgress: (update) => {
          if (!mounted.current || !isCurrent()) return;
          setRatio(update.ratio);
          setBusy(update.phase === 'download' ? 'Preparing on-device analysis' : 'Verifying the on-device model');
        },
        onPhase: (phase) => {
          if (!mounted.current || !isCurrent()) return;
          setRatio(0.2);
          setBusy(phase === 'load' ? 'Loading the vision model' : 'Reading the photo');
        },
      });
      if (!mounted.current || !isCurrent()) return;
      if (result.status === 'findings') {
        applyVisionFindings(generation, result.findings);
        setMessage(null);
      } else if (result.status === 'failed' || result.status === 'unsupported') {
        if (!result.message.includes('busy')) beginManualYarnFindings(true);
        setMessage(result.message);
      }
    } catch (error) {
      if (__DEV__ && error instanceof Error) {
        console.warn('[vision] analyze', error.message);
      }
      if (mounted.current && isCurrent()) {
        beginManualYarnFindings(true);
        setMessage('The photo could not be prepared. You can still enter the yarn details yourself.');
      }
    } finally {
      if (mounted.current && isCurrent()) setBusy(null);
    }
  };

  const onCreatePattern = async () => {
    const request = patternRequestFromDraft();
    if (!request || busy) return;
    const generation = getLeftoverYarnDraft().photoGeneration;
    const epoch = getLeftoverYarnDraft().sessionEpoch;
    const isCurrent = () => {
      const current = getLeftoverYarnDraft();
      return current.photoGeneration === generation && current.sessionEpoch === epoch;
    };
    setBusy('Writing a draft pattern');
    setMessage(null);
    const result = await createLeftoverPatternDraft({ request, isCurrent });
    if (!mounted.current || !isCurrent()) return;
    if (result.kind === 'cancelled' || result.kind === 'discarded') {
      setBusy(null);
      return;
    }
    storePatternDraft(result);
    setBusy(null);
  };

  const corrections = draft.corrections;
  const yards = parseAvailableYards(corrections?.yardsText ?? draft.yardsText);

  return (
    <View style={styles.form}>
      {draft.photoUri ? (
        <View style={styles.block}>
          <Image accessible accessibilityLabel="Yarn photo" source={{ uri: draft.photoUri }} resizeMode="cover" style={styles.photo} />
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Analyze photo"
            testID="leftover-analyze"
            disabled={busy != null}
            onPress={() => {
              void onAnalyze();
            }}
            style={({ pressed }) => [styles.primaryButton, busy && styles.disabled, pressed && styles.pressed, webCursor]}
          >
            <Text style={styles.primaryLabel}>{busy ?? 'Analyze'}</Text>
          </Pressable>
          {busy ? (
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.round(Math.max(ratio, 0.08) * 100)}%` }]} />
            </View>
          ) : null}
          {busy ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel analysis"
              onPress={() => cancelVisionDownload()}
              style={({ pressed }) => [styles.textAction, pressed && styles.pressed, webCursor]}
            >
              <Text style={styles.removeLabel}>Cancel</Text>
            </Pressable>
          ) : null}
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

      {message ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {message}
        </Text>
      ) : null}

      {corrections ? (
        <FindingsEditor
          corrections={corrections}
          source={draft.analysisSource}
          confirmed={draft.confirmed}
          catalog={draft.catalog}
          catalogNote={draft.catalogNote}
          onPreviewPattern={onPreviewPattern}
          onConfirm={() => {
            const current = getLeftoverYarnDraft().corrections;
            if (!current) return;
            confirmVisionFindings(
              recommendConfirmedCatalog({
                yarnCategory: current.yarnCategory,
                quantityCategory: current.quantityCategory,
                yardsText: current.yardsText,
                gramsText: current.gramsText,
              }),
            );
          }}
        />
      ) : null}

      {draft.confirmed && corrections && corrections.yarnCategory !== 'uncertain' ? (
        <PatternDraftSection
          make={draft.patternMake}
          size={draft.patternSize}
          skill={draft.patternSkill}
          draftResult={draft.patternDraft}
          busy={busy != null}
          onCreate={() => {
            void onCreatePattern();
          }}
        />
      ) : null}

      {draft.confirmed && corrections && corrections.yarnCategory !== 'uncertain' && (yards > 0 || corrections.quantityCategory !== 'uncertain') ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Save leftover to stash"
          onPress={() => {
            const available = yards > 0 ? yards : categoryYards(corrections.quantityCategory);
            onSaveToStash({
              colors: [],
              yarnWeight: corrections.yarnCategory === 'uncertain' ? draft.weight : corrections.yarnCategory,
              yardageTier: tierForYards(available),
              availableYards: available,
              hookSize: hookForYarnWeight(corrections.yarnCategory === 'uncertain' ? draft.weight : corrections.yarnCategory),
            });
          }}
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed, webCursor]}
        >
          <Text style={styles.accentLabel}>Save leftover to stash</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function FindingsEditor({
  corrections,
  source,
  confirmed,
  catalog,
  catalogNote,
  onPreviewPattern,
  onConfirm,
}: {
  corrections: VisionCorrections;
  source: 'vision' | 'user' | null;
  confirmed: boolean;
  catalog: VisionCatalogCard[] | null;
  catalogNote: string | null;
  onPreviewPattern: (pattern: CrochetPattern) => void;
  onConfirm: () => void;
}) {
  return (
    <View style={styles.block}>
      <Text style={styles.resultsTitle}>Findings</Text>
      <Text style={styles.note}>
        {source === 'vision'
          ? 'From the photo. Correct anything that looks wrong.'
          : 'These are your entries. The photo was not analyzed.'}
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
      {confirmed ? (
        <View style={styles.results}>
          <Text style={styles.resultsTitle}>Tutorials</Text>
          {catalogNote ? <Text style={styles.note}>{catalogNote}</Text> : null}
          {catalog && catalog.length > 0 ? (
            catalog.map((item) => <CatalogCard key={item.pattern.id} item={item} onPreview={() => onPreviewPattern(item.pattern)} />)
          ) : catalogNote?.startsWith('Searching') ? (
            <Text style={styles.note}>No tutorial in the catalog fits this yarn and amount.</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function PatternDraftSection({
  make,
  size,
  skill,
  draftResult,
  busy,
  onCreate,
}: {
  make: string;
  size: string;
  skill: PatternDifficulty;
  draftResult: ReturnType<typeof getLeftoverYarnDraft>['patternDraft'];
  busy: boolean;
  onCreate: () => void;
}) {
  return (
    <View style={styles.block}>
      <Text style={styles.resultsTitle}>Create a pattern</Text>
      <Text style={styles.note}>This writes a separate draft. It is not one of the tutorials above.</Text>
      <Text style={styles.label}>What do you want to make?</Text>
      <TextInput
        accessibilityLabel="What do you want to make"
        value={make}
        onChangeText={(patternMake) => updatePatternRequest({ patternMake })}
        style={styles.yardsInput}
      />
      <Text style={styles.label}>Approximate size</Text>
      <TextInput
        accessibilityLabel="Approximate size"
        value={size}
        onChangeText={(patternSize) => updatePatternRequest({ patternSize })}
        style={styles.yardsInput}
      />
      <Text style={styles.label}>Skill</Text>
      <View style={styles.chips}>
        {SKILLS.map((option) => (
          <Chip key={option} label={difficultyLabel(option)} selected={skill === option} onPress={() => updatePatternRequest({ patternSkill: option })} />
        ))}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Create a pattern"
        testID="leftover-create-pattern"
        disabled={busy}
        onPress={onCreate}
        style={({ pressed }) => [styles.secondaryButton, busy && styles.disabled, pressed && styles.pressed, webCursor]}
      >
        <Text style={styles.accentLabel}>Create a pattern</Text>
      </Pressable>
      {draftResult && draftResult.kind === 'draft' ? (
        <View style={styles.draftCard}>
          <Text style={styles.ideaTitle}>Draft pattern</Text>
          <Text style={styles.note}>{draftResult.banner}</Text>
          <Text style={styles.ideaTitle}>{draftResult.title}</Text>
          <Text style={styles.note}>{draftResult.shapeLabel}</Text>
          <Text style={styles.note}>{draftResult.materials}</Text>
          <Text style={styles.note}>Suggested hook: {draftResult.hook}</Text>
          <Text style={styles.note}>{draftResult.gaugeNote}</Text>
          <Text style={styles.label}>Abbreviations</Text>
          {draftResult.abbreviations.map((item) => (
            <Text key={item.abbr} style={styles.note}>
              {item.abbr}: {item.meaning}
            </Text>
          ))}
          <Text style={styles.label}>Instructions</Text>
          {draftResult.instructions.map((step) => (
            <Text key={step.n} style={styles.note}>
              {step.n}. {step.text} ({step.stitchCount} stitches)
            </Text>
          ))}
        </View>
      ) : null}
      {draftResult && draftResult.kind === 'rejected' ? (
        <View style={styles.block}>
          <Text style={styles.note}>This draft did not pass the stitch-count check.</Text>
          {draftResult.reasons.map((reason) => (
            <Text key={reason} style={styles.note}>
              {reason}
            </Text>
          ))}
        </View>
      ) : null}
      {draftResult && (draftResult.kind === 'unsupported' || draftResult.kind === 'failed') ? (
        <Text style={styles.note}>{draftResult.message}</Text>
      ) : null}
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
  note: {
    ...Typography.caption,
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
  ideaTitle: {
    ...Typography.label,
    color: Colors.textPrimary,
  },
  ideaMeta: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  draftCard: {
    gap: Spacing.xs,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.elevatedControl,
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
