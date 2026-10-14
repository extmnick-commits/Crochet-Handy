/**
 * Me — profile stats, yarn stash, and saved patterns with story reels.
 */
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AddYarnModal } from '@/components/AddYarnModal';
import { PatternDetailSheet } from '@/components/PatternDetailSheet';
import { PhotoProgressModal } from '@/components/PhotoProgressModal';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Colors, FontFamily, FontWeight, Layout, Radius, Spacing, Typography } from '@/constants/BambuTheme';
import {
  elapsedSeconds,
  MAX_SKEINS,
  stitchesDone,
  useCrochetStore,
  type YarnStashItem,
} from '@/store/useCrochetStore';
import { yarnWeightMeta } from '@/utils/patternDisplay';
import { youtubeThumbnailUrl } from '@/utils/youtube';

type LibraryTab = 'stash' | 'stories';

export default function MeScreen() {
  const insets = useSafeAreaInsets();
  const projects = useCrochetStore((state) => state.projects);
  const patterns = useCrochetStore((state) => state.patterns);
  const yarnStash = useCrochetStore((state) => state.yarnStash);
  const progressPhotos = useCrochetStore((state) => state.progressPhotos);
  const updateStashItem = useCrochetStore((state) => state.updateStashItem);
  const removeStashItem = useCrochetStore((state) => state.removeStashItem);
  const [tab, setTab] = useState<LibraryTab>('stash');
  const [addOpen, setAddOpen] = useState(false);
  const [patternId, setPatternId] = useState<string | null>(null);
  const [storyProjectId, setStoryProjectId] = useState<string | null>(null);
  const running = projects.some((project) => project.timerStartedAt != null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  const totalSeconds = projects.reduce((sum, project) => sum + elapsedSeconds(project, now), 0);
  const completed = projects.filter((project) => project.status === 'finished').length;
  const stitches = projects.reduce((sum, project) => sum + stitchesDone(project), 0);

  const stories = useMemo(() => {
    const groups = new Map<string, typeof progressPhotos>();
    for (const photo of progressPhotos) {
      const list = groups.get(photo.projectId) ?? [];
      list.push(photo);
      groups.set(photo.projectId, list);
    }
    return [...groups.entries()].map(([projectId, photos]) => {
      const ordered = [...photos].sort((a, b) => a.createdAt - b.createdAt);
      const project = projects.find((item) => item.id === projectId);
      const cover = ordered[ordered.length - 1];
      return {
        projectId,
        name: project?.name ?? cover?.projectName ?? 'Project',
        count: ordered.length,
        coverUri: cover?.uri ?? null,
        latestRow: cover?.row ?? 0,
        totalRows: cover?.totalRows ?? 0,
      };
    });
  }, [progressPhotos, projects]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text role="heading" aria-level={1} style={styles.title}>
            Me
          </Text>
          <Text style={styles.subtitle}>Profile & Yarn Stash</Text>
        </View>

        <View style={styles.stats}>
          <Stat testID="stat-hours" value={formatHours(totalSeconds)} label="Total hours crocheted" />
          <Stat testID="stat-completed" value={String(completed)} label="Completed projects" />
          <Stat testID="stat-stitches" value={stitches.toLocaleString()} label="Total stitches" />
        </View>

        <View accessibilityRole="tablist" style={styles.segment}>
          <Segment
            testID="yarn-stash-tab"
            label="Yarn Stash"
            selected={tab === 'stash'}
            onPress={() => {
              tick();
              setTab('stash');
            }}
          />
          <Segment
            testID="patterns-stories-tab"
            label="Saved Patterns & Stories"
            selected={tab === 'stories'}
            onPress={() => {
              tick();
              setTab('stories');
            }}
          />
        </View>

        {tab === 'stash' ? (
          <View style={styles.section}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add yarn to stash"
              testID="add-yarn"
              onPress={() => {
                tick();
                setAddOpen(true);
              }}
              style={({ pressed }) => [styles.addButton, pressed && styles.pressed, webCursor]}
            >
              <Text style={styles.addButtonText}>+ Add Yarn to Stash</Text>
            </Pressable>
            {yarnStash.length === 0 ? (
              <Text style={styles.empty}>Your stash is empty. Add a skein to start tracking colors.</Text>
            ) : (
              yarnStash.map((item) => (
                <YarnCard
                  key={item.id}
                  item={item}
                  onChange={(skeinCount) => updateStashItem(item.id, { skeinCount })}
                  onRemove={() => {
                    tick();
                    removeStashItem(item.id);
                  }}
                />
              ))
            )}
          </View>
        ) : (
          <View style={styles.section}>
            <Text role="heading" aria-level={2} style={styles.sectionTitle}>
              Saved patterns
            </Text>
            {patterns.length === 0 ? (
              <Text style={styles.empty}>Patterns you save from the feed show up here.</Text>
            ) : (
              patterns.map((pattern) => (
                <Pressable
                  key={pattern.id}
                  accessibilityRole="button"
                  accessibilityLabel={pattern.title}
                  onPress={() => {
                    tick();
                    setPatternId(pattern.id);
                  }}
                  style={({ pressed }) => [styles.patternRow, pressed && styles.pressed, webCursor]}
                >
                  <Image
                    accessible={false}
                    source={{ uri: youtubeThumbnailUrl(pattern.videoId, 'hq') }}
                    style={styles.patternThumb}
                  />
                  <View style={styles.patternCopy}>
                    <Text numberOfLines={2} style={styles.patternTitle}>
                      {pattern.title}
                    </Text>
                    <Text numberOfLines={1} style={styles.patternMeta}>
                      {pattern.creator} · {yarnWeightMeta(pattern.yarnWeight).label} {yarnWeightMeta(pattern.yarnWeight).number}
                    </Text>
                  </View>
                </Pressable>
              ))
            )}

            <Text role="heading" aria-level={2} style={styles.sectionTitle}>
              Stories
            </Text>
            {stories.length === 0 ? (
              <Text style={styles.empty}>Snap a progress photo on the Active tab and the reel will land here.</Text>
            ) : (
              stories.map((story) => (
                <Pressable
                  key={story.projectId}
                  accessibilityRole="button"
                  accessibilityLabel={`Watch ${story.name} story`}
                  testID={`story-${story.projectId}`}
                  onPress={() => {
                    tick();
                    setStoryProjectId(story.projectId);
                  }}
                  style={({ pressed }) => [styles.storyCard, pressed && styles.pressed, webCursor]}
                >
                  {story.coverUri ? (
                    <Image accessible={false} source={{ uri: story.coverUri }} style={styles.storyCover} />
                  ) : (
                    <View style={[styles.storyCover, styles.storyCoverEmpty]} />
                  )}
                  <View style={styles.patternCopy}>
                    <Text numberOfLines={1} style={styles.patternTitle}>
                      {story.name}
                    </Text>
                    <Text style={styles.patternMeta}>
                      {story.count} {story.count === 1 ? 'still' : 'stills'} · Row {story.latestRow}/{story.totalRows}
                    </Text>
                  </View>
                  <Text style={styles.watchLabel}>Watch</Text>
                </Pressable>
              ))
            )}
          </View>
        )}
      </ScrollView>

      <AddYarnModal visible={addOpen} onClose={() => setAddOpen(false)} />
      <PatternDetailSheet patternId={patternId} onClose={() => setPatternId(null)} />
      <PhotoProgressModal
        visible={storyProjectId != null}
        projectId={storyProjectId}
        initialView="reel"
        onClose={() => setStoryProjectId(null)}
      />
    </View>
  );
}

function Stat({ testID, value, label }: { testID: string; value: string; label: string }) {
  return (
    <View style={styles.stat} testID={testID}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Segment({
  testID,
  label,
  selected,
  onPress,
}: {
  testID: string;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [styles.segmentItem, selected && styles.segmentItemOn, pressed && styles.pressed, webCursor]}
    >
      <Text style={[styles.segmentText, selected && styles.segmentTextOn]}>{label}</Text>
    </Pressable>
  );
}

function YarnCard({
  item,
  onChange,
  onRemove,
}: {
  item: YarnStashItem;
  onChange: (skeinCount: number) => void;
  onRemove: () => void;
}) {
  const meta = yarnWeightMeta(item.yarnWeight);
  const ink = inkOn(item.hexColor);
  const atMin = item.skeinCount <= 0;
  const atMax = item.skeinCount >= MAX_SKEINS;

  return (
    <View style={styles.yarnCard} testID={`yarn-card-${item.id}`}>
      <View style={[styles.swatch, { backgroundColor: item.hexColor }]}>
        <Text style={[styles.swatchHex, { color: ink }]}>{item.hexColor}</Text>
      </View>
      <View style={styles.yarnBody}>
        <Text numberOfLines={1} style={styles.yarnBrand}>
          {item.brand}
        </Text>
        <Text numberOfLines={1} style={styles.yarnName}>
          {item.colorName}
        </Text>
        <View style={styles.weightBadge}>
          <Text style={styles.weightBadgeText}>
            {meta.label} {meta.number}
          </Text>
        </View>
        <View style={styles.skeinRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove a skein of ${item.colorName}`}
            accessibilityState={{ disabled: atMin }}
            disabled={atMin}
            testID={`skein-dec-${item.id}`}
            onPress={() => {
              tick('impact');
              onChange(item.skeinCount - 1);
            }}
            style={({ pressed }) => [styles.step, atMin && styles.stepDisabled, pressed && styles.pressed, webCursor]}
          >
            <Text style={styles.stepText}>−</Text>
          </Pressable>
          <Text style={styles.skeinCount}>
            {item.skeinCount} {item.skeinCount === 1 ? 'skein' : 'skeins'}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Add a skein of ${item.colorName}`}
            accessibilityState={{ disabled: atMax }}
            disabled={atMax}
            testID={`skein-inc-${item.id}`}
            onPress={() => {
              tick('impact');
              onChange(item.skeinCount + 1);
            }}
            style={({ pressed }) => [styles.step, atMax && styles.stepDisabled, pressed && styles.pressed, webCursor]}
          >
            <Text style={styles.stepText}>+</Text>
          </Pressable>
        </View>
        <View style={styles.cardActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove ${item.colorName} from stash`}
            onPress={onRemove}
            hitSlop={Layout.hitSlop}
            style={({ pressed }) => [pressed && styles.pressed, webCursor]}
          >
            <Text style={styles.remove}>Remove</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function formatHours(totalSeconds: number): string {
  const hours = totalSeconds / 3600;
  if (!Number.isFinite(hours) || hours <= 0) return '0';
  if (hours < 10) return (Math.round(hours * 10) / 10).toFixed(1);
  return Math.round(hours).toLocaleString();
}

function inkOn(hex: string): string {
  const raw = hex.replace('#', '');
  if (raw.length !== 6) return Colors.textPrimary;
  const red = Number.parseInt(raw.slice(0, 2), 16);
  const green = Number.parseInt(raw.slice(2, 4), 16);
  const blue = Number.parseInt(raw.slice(4, 6), 16);
  const luma = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
  return luma > 0.64 ? '#121212' : '#FFFFFF';
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
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Layout.screenGutter,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xxxl,
    gap: Spacing.lg,
  },
  header: {
    gap: Spacing.xxs,
  },
  title: {
    ...Typography.title,
    color: Colors.textPrimary,
  },
  subtitle: {
    ...Typography.callout,
    color: Colors.textSecondary,
  },
  stats: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  stat: {
    flex: 1,
    minHeight: 84,
    borderRadius: Radius.lg,
    backgroundColor: Colors.cardSurface,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.md,
    justifyContent: 'center',
    gap: 4,
  },
  statValue: {
    fontFamily: FontFamily.medium,
    fontSize: 26,
    lineHeight: 30,
    fontWeight: FontWeight.bold,
    letterSpacing: -0.6,
    color: Colors.textPrimary,
  },
  statLabel: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  segment: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: Radius.lg,
    backgroundColor: Colors.cardSurface,
  },
  segmentItem: {
    flex: 1,
    minHeight: 52,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xs,
    paddingVertical: Spacing.sm,
  },
  segmentItemOn: {
    backgroundColor: Colors.accentMuted,
  },
  segmentText: {
    fontFamily: FontFamily.medium,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  segmentTextOn: {
    color: Colors.accentPrimary,
  },
  section: {
    gap: Spacing.md,
  },
  sectionTitle: {
    ...Typography.headline,
    color: Colors.textPrimary,
  },
  addButton: {
    minHeight: 48,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accentPrimary,
  },
  addButtonText: {
    ...Typography.label,
    color: Colors.onAccent,
  },
  empty: {
    ...Typography.callout,
    color: Colors.textSecondary,
  },
  yarnCard: {
    flexDirection: 'row',
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.cardSurface,
  },
  swatch: {
    width: 108,
    minHeight: 148,
    alignItems: 'center',
    justifyContent: 'flex-end',
    padding: Spacing.sm,
  },
  swatchHex: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: FontWeight.semibold,
  },
  yarnBody: {
    flex: 1,
    padding: Spacing.md,
    gap: 4,
  },
  yarnBrand: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  yarnName: {
    ...Typography.subhead,
    color: Colors.textPrimary,
  },
  weightBadge: {
    alignSelf: 'flex-start',
    marginTop: 2,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.pill,
    backgroundColor: Colors.elevatedControl,
  },
  weightBadgeText: {
    ...Typography.caption,
    color: Colors.textPrimary,
    fontWeight: FontWeight.semibold,
  },
  skeinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  step: {
    width: 36,
    height: 36,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.elevatedControl,
  },
  stepDisabled: {
    opacity: 0.35,
  },
  stepText: {
    ...Typography.headline,
    color: Colors.textPrimary,
  },
  skeinCount: {
    ...Typography.label,
    flex: 1,
    color: Colors.textPrimary,
  },
  remove: {
    ...Typography.caption,
    color: Colors.danger,
    fontWeight: FontWeight.semibold,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  loadPill: {
    minHeight: 32,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.accentPrimary,
    backgroundColor: Colors.accentMuted,
  },
  loadPillText: {
    ...Typography.caption,
    color: Colors.accentPrimary,
    fontWeight: FontWeight.semibold,
  },
  sheetHeader: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    gap: Spacing.xxs,
  },
  sheetTitle: {
    ...Typography.headline,
    color: Colors.textPrimary,
  },
  sheetSubtitle: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  sheetBody: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.transparent,
    backgroundColor: Colors.elevatedControl,
  },
  slotRowSelected: {
    backgroundColor: Colors.accentMuted,
    borderColor: Colors.accentPrimary,
  },
  slotSwatch: {
    width: 48,
    height: 48,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotSwatchLabel: {
    ...Typography.caption,
    fontWeight: FontWeight.bold,
  },
  slotAction: {
    ...Typography.caption,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
  },
  patternRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.sm,
    borderRadius: Radius.lg,
    backgroundColor: Colors.cardSurface,
  },
  patternThumb: {
    width: 84,
    height: 56,
    borderRadius: Radius.sm,
    backgroundColor: Colors.elevatedControl,
  },
  patternCopy: {
    flex: 1,
    gap: 2,
  },
  patternTitle: {
    ...Typography.label,
    color: Colors.textPrimary,
  },
  patternMeta: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  storyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.sm,
    borderRadius: Radius.lg,
    backgroundColor: Colors.cardSurface,
  },
  storyCover: {
    width: 56,
    height: 72,
    borderRadius: Radius.sm,
    backgroundColor: Colors.elevatedControl,
  },
  storyCoverEmpty: {
    backgroundColor: '#000000',
  },
  watchLabel: {
    ...Typography.caption,
    color: Colors.accentPrimary,
    fontWeight: FontWeight.semibold,
  },
  pressed: {
    opacity: 0.72,
  },
});
