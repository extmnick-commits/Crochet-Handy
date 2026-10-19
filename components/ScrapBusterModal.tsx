/**
 * Leftover yarn. A photo opens the project list for the yarn weight and yards.
 * The list updates as those change. The photo is not scanned for color.
 */
import { useMemo, useState, useSyncExternalStore } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { BottomSheet } from '@/components/ui/BottomSheet';
import { Colors, FontWeight, Layout, Radius, Spacing, Typography } from '@/constants/BambuTheme';
import { YARN_WEIGHTS, type CrochetPattern } from '@/store/useCrochetStore';
import {
  displayThumbnail,
  recommendationThumbnail,
} from '@/utils/catalogPreview';
import {
  getLeftoverYarnDraft,
  replaceLeftoverPhoto,
  resetLeftoverYarnDraft,
  subscribeLeftoverYarnDraft,
  updateLeftoverYarnDraft,
} from '@/utils/leftoverYarnDraft';
import { difficultyLabel, yarnWeightMeta } from '@/utils/patternDisplay';
import { captureErrorMessage, captureProgressPhoto, type CaptureSource } from '@/utils/progressPhoto';
import {
  YARDAGE_TIERS,
  hookForYarnWeight,
  offlineScrapSuggestion,
  parseAvailableYards,
  tierForYards,
  type ScannedLeftoverDraft,
  type ScrapCatalogSuggestion,
} from '@/utils/scrapYarnAi';

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
            <Text style={styles.subtitle}>A photo, then projects that fit this yarn</Text>
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
  const [status, setStatus] = useState<string | null>(null);
  const yards = parseAvailableYards(draft.yardsText);
  const shown = useMemo(
    () => offlineScrapSuggestion({ colors: [], weight: draft.weight, availableYards: yards }),
    [draft.weight, yards],
  );

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

  return (
    <View style={styles.form}>
      {draft.photoUri ? (
        <View style={styles.block}>
          <Image
            accessible
            accessibilityLabel="Yarn photo"
            source={{ uri: draft.photoUri }}
            resizeMode="cover"
            style={styles.photo}
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

      {draft.photoUri ? (
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

      {draft.photoUri && yards > 0 ? (
        <View style={styles.results}>
          <Text style={styles.resultsTitle}>Projects you can make</Text>
          {shown.ideas.length === 0 ? (
            <Text style={styles.note}>No planning estimate fits in {yards} yd.</Text>
          ) : (
            shown.ideas.map((idea) => (
              <View key={idea.planId} style={styles.ideaCard}>
                <View style={styles.ideaCopy}>
                  <Text style={styles.ideaTitle}>{idea.title}</Text>
                  <Text style={styles.ideaMeta}>
                    {difficultyLabel(idea.difficulty)} · {idea.hookSize}
                  </Text>
                  <Text style={styles.note}>Planning estimate: {idea.estimatedYardage}</Text>
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
                colors: [],
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
