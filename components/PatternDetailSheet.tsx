/**
 * Pattern detail sheet opened from a feed card.
 *
 * Yarn swatches come from the stash (same weight) and from any project already
 * using this pattern. Starting a project copies the pattern's row counts and
 * makes that project the one on the Active tab.
 */
import * as Haptics from 'expo-haptics';
import { useMemo, useState } from 'react';
import { Image, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';

import { BottomSheet } from '@/components/ui/BottomSheet';
import { Colors, FontWeight, Layout, Radius, Spacing, Typography } from '@/constants/BambuTheme';
import {
  selectIsPatternLiked,
  useCrochetStore,
  type CrochetPattern,
  type CrochetProject,
  type IdeaFolder,
  type YarnStashItem,
} from '@/store/useCrochetStore';
import {
  creatorColor,
  creatorInitials,
  difficultyLabel,
  formatHookSize,
  formatSpecBadge,
  yarnSizeLabel,
} from '@/utils/patternDisplay';
import { formatBookmarkTime } from '@/utils/chapters';
import { youtubeThumbnailUrl } from '@/utils/youtube';

type PatternDetailSheetProps = {
  patternId: string | null;
  onClose: () => void;
};

type Swatch = {
  hex: string;
  name: string;
};

export function PatternDetailSheet({ patternId, onClose }: PatternDetailSheetProps) {
  const router = useRouter();
  const pattern = useCrochetStore((state) =>
    patternId ? (state.patterns.find((item) => item.id === patternId) ?? null) : null,
  );
  const projects = useCrochetStore((state) => state.projects);
  const yarnStash = useCrochetStore((state) => state.yarnStash);
  const createProject = useCrochetStore((state) => state.createProject);
  const toggleLikePattern = useCrochetStore((state) => state.toggleLikePattern);
  const ideaFolders = useCrochetStore((state) => state.ideaFolders);
  const togglePatternInFolder = useCrochetStore((state) => state.togglePatternInFolder);
  const createIdeaFolder = useCrochetStore((state) => state.createIdeaFolder);
  const liked = useCrochetStore((state) => (patternId ? selectIsPatternLiked(state, patternId) : false));
  const savedFolders = useMemo(
    () => (patternId ? ideaFolders.filter((folder) => folder.patternIds.includes(patternId)) : []),
    [ideaFolders, patternId],
  );
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const swatches = useMemo(
    () => (pattern ? collectSwatches(pattern, projects, yarnStash) : []),
    [pattern, projects, yarnStash],
  );

  const onStart = () => {
    if (!pattern) return;
    const id = createProject({ name: pattern.title, patternId: pattern.id });
    if (!id) return;
    onClose();
    router.navigate('/active');
  };

  return (
    <BottomSheet
      visible={pattern !== null}
      onClose={onClose}
      footer={
        pattern ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Start Project (Send to Active Tab)"
            testID="pattern-detail-start"
            onPress={onStart}
            style={({ pressed }) => [styles.start, pressed && styles.pressed, webCursor]}
          >
            <Text style={styles.startText}>Start Project (Send to Active Tab)</Text>
          </Pressable>
        ) : null
      }
    >
      {pattern && (
        <View style={styles.content}>
          <View style={styles.hero}>
            <Image
              accessible={false}
              source={{ uri: youtubeThumbnailUrl(pattern.videoId, 'hq') }}
              style={styles.heroImage}
            />
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{formatSpecBadge(pattern)}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed, webCursor]}
            >
              <Text style={styles.closeGlyph}>×</Text>
            </Pressable>
          </View>

          <Text role="heading" aria-level={2} style={styles.title}>
            {pattern.title}
          </Text>

          <View style={styles.creatorRow}>
            <View style={[styles.avatar, { backgroundColor: creatorColor(pattern.creator) }]}>
              <Text style={styles.avatarText}>{creatorInitials(pattern.creator)}</Text>
            </View>
            <Text style={styles.creator} numberOfLines={1}>
              {pattern.creator}
            </Text>
          </View>

          <View style={styles.actionBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: liked }}
              accessibilityLabel={liked ? 'Unlike pattern' : 'Like pattern'}
              onPress={() => {
                tick();
                toggleLikePattern(pattern.id);
              }}
              style={({ pressed }) => [
                styles.actionPill,
                liked && styles.actionPillOn,
                pressed && styles.pressed,
                webCursor,
              ]}
            >
              <HeartIcon color={liked ? Colors.accentPrimary : Colors.textSecondary} filled={liked} size={16} />
              <Text style={[styles.actionPillText, liked && styles.actionPillTextOn]}>{liked ? 'Liked' : 'Like'}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Save to folder"
              onPress={() => {
                tick();
                setFolderPickerOpen(true);
              }}
              style={({ pressed }) => [styles.actionPill, pressed && styles.pressed, webCursor]}
            >
              <Text style={styles.actionPillText}>
                {savedFolders.length > 0 ? `Saved in ${savedFolders.length} folders` : 'Save to Folder'}
              </Text>
            </Pressable>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Yarn colors</Text>
            {swatches.length > 0 ? (
              <ScrollView
                horizontal
                nestedScrollEnabled
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.swatchRow}
              >
                {swatches.map((swatch) => (
                  <View key={swatch.hex} style={styles.swatchItem} accessibilityLabel={`${swatch.name} ${swatch.hex}`}>
                    <View style={[styles.swatch, { backgroundColor: swatch.hex }]} />
                    <Text style={styles.swatchName} numberOfLines={2}>
                      {swatch.name}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <Text style={styles.emptySwatches}>No yarn in this weight is in your stash yet.</Text>
            )}
          </View>

          {pattern.bookmarks.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Tutorial chapters</Text>
              <View style={styles.chapterWrap}>
                {pattern.bookmarks.map((bookmark) => (
                  <View
                    key={bookmark.id}
                    style={styles.chapterChip}
                    accessibilityLabel={`${formatBookmarkTime(bookmark.seconds)} ${bookmark.label}`}
                  >
                    <Text style={styles.chapterTime}>{formatBookmarkTime(bookmark.seconds)}</Text>
                    <Text numberOfLines={1} style={styles.chapterLabel}>
                      {bookmark.label}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          <View style={styles.specs}>
            <Spec label="Yarn size" value={yarnSizeLabel(pattern.yarnWeight)} />
            <Spec label="Hook size" value={formatHookSize(pattern.hookSize)} />
            <Spec label="Total rows" value={String(pattern.totalRows)} />
            <Spec label="Stitches per row" value={String(pattern.stitchesPerRow)} />
            <Spec label="Difficulty" value={difficultyLabel(pattern.difficulty)} />
          </View>

          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Watch tutorial on YouTube"
            onPress={() => {
              void Linking.openURL(pattern.youtubeUrl);
            }}
            style={({ pressed }) => [styles.watch, pressed && styles.pressed, webCursor]}
          >
            <Text style={styles.watchText}>Watch tutorial</Text>
          </Pressable>
        </View>
      )}
      {pattern && (
        <FolderPickerModal
          visible={folderPickerOpen}
          patternId={pattern.id}
          folders={ideaFolders}
          savedFolderIds={savedFolders.map((folder) => folder.id)}
          newFolderName={newFolderName}
          onNewFolderNameChange={setNewFolderName}
          onToggleFolder={(folderId) => togglePatternInFolder(folderId, pattern.id)}
          onCreateFolder={() => {
            const name = newFolderName.trim();
            if (!name) return;
            const id = createIdeaFolder({ name });
            if (id) {
              togglePatternInFolder(id, pattern.id);
              setNewFolderName('');
            }
          }}
          onClose={() => setFolderPickerOpen(false)}
        />
      )}
    </BottomSheet>
  );
}

function FolderPickerModal({
  visible,
  patternId,
  folders,
  savedFolderIds,
  newFolderName,
  onNewFolderNameChange,
  onToggleFolder,
  onCreateFolder,
  onClose,
}: {
  visible: boolean;
  patternId: string;
  folders: IdeaFolder[];
  savedFolderIds: string[];
  newFolderName: string;
  onNewFolderNameChange: (value: string) => void;
  onToggleFolder: (folderId: string) => void;
  onCreateFolder: () => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.folderScrim}>
        <Pressable accessibilityLabel="Close folder picker" style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.folderSheet}>
          <Text role="heading" aria-level={2} style={styles.folderTitle}>
            Save to folder
          </Text>
          <Text style={styles.folderSubtitle} testID={`folder-picker-${patternId}`}>
            Toggle folders for this pattern or create a new one.
          </Text>
          <View style={styles.newFolderRow}>
            <TextInput
              value={newFolderName}
              onChangeText={onNewFolderNameChange}
              placeholder="New folder name"
              placeholderTextColor={Colors.textTertiary}
              selectionColor={Colors.accentPrimary}
              style={styles.newFolderInput}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Create folder"
              onPress={onCreateFolder}
              style={({ pressed }) => [styles.newFolderButton, pressed && styles.pressed, webCursor]}
            >
              <Text style={styles.newFolderButtonText}>Add</Text>
            </Pressable>
          </View>
          <ScrollView style={styles.folderList} keyboardShouldPersistTaps="handled">
            {folders.length === 0 ? (
              <Text style={styles.folderEmpty}>No idea folders yet. Name one above to get started.</Text>
            ) : (
              folders.map((folder) => {
                const selected = savedFolderIds.includes(folder.id);
                return (
                  <Pressable
                    key={folder.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      tick();
                      onToggleFolder(folder.id);
                    }}
                    style={({ pressed }) => [
                      styles.folderRow,
                      selected && styles.folderRowOn,
                      pressed && styles.pressed,
                      webCursor,
                    ]}
                  >
                    <Text style={styles.folderRowTitle}>{folder.name}</Text>
                    <Text style={styles.folderRowMeta}>{folder.patternIds.length} patterns</Text>
                  </Pressable>
                );
              })
            )}
          </ScrollView>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Done"
            onPress={onClose}
            style={({ pressed }) => [styles.folderDone, pressed && styles.pressed, webCursor]}
          >
            <Text style={styles.folderDoneText}>Done</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function tick() {
  if (Platform.OS === 'web') return;
  void Haptics.selectionAsync();
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.specRow}>
      <Text style={styles.specLabel}>{label}</Text>
      <Text style={styles.specValue}>{value}</Text>
    </View>
  );
}

function collectSwatches(pattern: CrochetPattern, projects: CrochetProject[], stash: YarnStashItem[]): Swatch[] {
  const swatches: Swatch[] = [];
  const seen = new Set<string>();

  const push = (hex: string, name: string) => {
    const normalized = hex.trim().toUpperCase();
    const label = name.trim();
    if (!normalized || !label || seen.has(normalized)) return;
    seen.add(normalized);
    swatches.push({ hex: normalized, name: label });
  };

  for (const project of projects) {
    if (project.patternId !== pattern.id) continue;
    for (const color of project.yarnColors) {
      push(color.hexColor, color.label);
    }
  }

  for (const item of stash) {
    if (item.yarnWeight !== pattern.yarnWeight) continue;
    push(item.hexColor, item.colorName);
  }

  return swatches;
}

/** Heart used beside the like count and on the detail action bar. */
export function HeartIcon({
  color,
  size = 14,
  filled = false,
}: {
  color: string;
  size?: number;
  filled?: boolean;
}) {
  const path =
    'M12 19.4 C7.2 16.2 4 13.4 4 9.8 C4 7.2 6 5.2 8.5 5.2 C10 5.2 11.2 5.9 12 7 C12.8 5.9 14 5.2 15.5 5.2 C18 5.2 20 7.2 20 9.8 C20 13.4 16.8 16.2 12 19.4 Z';
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d={path}
        fill={filled ? color : 'none'}
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

const webCursor = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : null;

const styles = StyleSheet.create({
  content: {
    paddingBottom: Spacing.sm,
    gap: Spacing.md,
  },
  hero: {
    marginHorizontal: Layout.screenGutter,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: Colors.elevatedControl,
  },
  heroImage: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
  badge: {
    position: 'absolute',
    top: Spacing.sm,
    left: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.pill,
    backgroundColor: Colors.accentPrimary,
  },
  badgeText: {
    ...Typography.caption,
    color: Colors.onAccent,
    fontWeight: FontWeight.bold,
  },
  closeButton: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    width: 32,
    height: 32,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(18, 18, 18, 0.72)',
  },
  closeGlyph: {
    marginTop: -2,
    color: Colors.textPrimary,
    fontSize: 22,
    lineHeight: 24,
    fontWeight: FontWeight.medium,
  },
  title: {
    ...Typography.headline,
    color: Colors.textPrimary,
    paddingHorizontal: Layout.screenGutter,
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Layout.screenGutter,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...Typography.caption,
    color: Colors.textPrimary,
    fontWeight: FontWeight.bold,
  },
  creator: {
    ...Typography.callout,
    flex: 1,
    color: Colors.textSecondary,
  },
  actionBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    paddingHorizontal: Layout.screenGutter,
  },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.pill,
    backgroundColor: Colors.elevatedControl,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  actionPillOn: {
    backgroundColor: Colors.accentMuted,
    borderColor: Colors.accentPrimary,
  },
  actionPillText: {
    ...Typography.caption,
    color: Colors.textPrimary,
    fontWeight: FontWeight.semibold,
  },
  actionPillTextOn: {
    color: Colors.accentPrimary,
  },
  folderScrim: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: Colors.scrim,
  },
  folderSheet: {
    maxHeight: '72%',
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    backgroundColor: Colors.cardSurface,
    paddingHorizontal: Layout.screenGutter,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
    gap: Spacing.md,
  },
  folderTitle: {
    ...Typography.headline,
    color: Colors.textPrimary,
  },
  folderSubtitle: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  newFolderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  newFolderInput: {
    ...Typography.body,
    flex: 1,
    minHeight: 44,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    color: Colors.textPrimary,
    backgroundColor: Colors.elevatedControl,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  newFolderButton: {
    minHeight: 44,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accentPrimary,
  },
  newFolderButtonText: {
    ...Typography.caption,
    color: Colors.onAccent,
    fontWeight: FontWeight.bold,
  },
  folderList: {
    maxHeight: 280,
  },
  folderEmpty: {
    ...Typography.callout,
    color: Colors.textSecondary,
  },
  folderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.elevatedControl,
    marginBottom: Spacing.sm,
  },
  folderRowOn: {
    backgroundColor: Colors.accentMuted,
    borderWidth: 1,
    borderColor: Colors.accentPrimary,
  },
  folderRowTitle: {
    ...Typography.label,
    color: Colors.textPrimary,
    flex: 1,
  },
  folderRowMeta: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  folderDone: {
    minHeight: 48,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.elevatedControl,
  },
  folderDoneText: {
    ...Typography.label,
    color: Colors.textPrimary,
  },
  section: {
    gap: Spacing.sm,
    paddingHorizontal: Layout.screenGutter,
  },
  sectionLabel: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  swatchRow: {
    gap: Spacing.md,
    paddingRight: Spacing.sm,
  },
  swatchItem: {
    width: 84,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  swatch: {
    width: 28,
    height: 28,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
  },
  swatchName: {
    ...Typography.caption,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  emptySwatches: {
    ...Typography.callout,
    color: Colors.textSecondary,
  },
  chapterWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  chapterChip: {
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
  chapterTime: {
    ...Typography.caption,
    color: Colors.onAccent,
    fontWeight: FontWeight.bold,
    backgroundColor: Colors.accentPrimary,
    overflow: 'hidden',
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xxs,
  },
  chapterLabel: {
    ...Typography.caption,
    flexShrink: 1,
    color: Colors.textPrimary,
    fontWeight: FontWeight.medium,
  },
  specs: {
    marginHorizontal: Layout.screenGutter,
    borderRadius: Radius.md,
    backgroundColor: Colors.backgroundPrimary,
    overflow: 'hidden',
  },
  specRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: Layout.hairline,
    borderBottomColor: Colors.border,
  },
  specLabel: {
    ...Typography.callout,
    color: Colors.textSecondary,
  },
  specValue: {
    ...Typography.callout,
    color: Colors.textPrimary,
    fontWeight: FontWeight.semibold,
  },
  watch: {
    alignSelf: 'flex-start',
    marginHorizontal: Layout.screenGutter,
    paddingVertical: Spacing.xs,
  },
  watchText: {
    ...Typography.label,
    color: Colors.accentPrimary,
  },
  start: {
    marginHorizontal: Layout.screenGutter,
    marginTop: Spacing.sm,
    minHeight: 52,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accentPrimary,
  },
  startText: {
    ...Typography.label,
    color: Colors.onAccent,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.72,
  },
});
