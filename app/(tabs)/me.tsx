/**
 * Me — profile, Collections | Likes library, folders, and progress stories.
 */
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { signOut } from 'firebase/auth';
import { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { AuthAccountModal } from '@/components/AuthAccountModal';
import { PatternFeedCard } from '@/components/PatternFeedCard';
import { PatternDetailSheet } from '@/components/PatternDetailSheet';
import { PhotoProgressModal } from '@/components/PhotoProgressModal';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Colors, FontFamily, FontWeight, Layout, Radius, Spacing, Typography } from '@/constants/BambuTheme';
import { normalizePatternTag } from '@/utils/patternDisplay';
import {
  elapsedSeconds,
  stitchesDone,
  useCrochetStore,
  type CrochetPattern,
  type IdeaFolder,
  type UserAccount,
} from '@/store/useCrochetStore';
import { auth, isFirebaseConfigured } from '@/utils/firebase';
import {
  creatorInitials,
  matchesPatternQuery,
  MASONRY_TEXT_BLOCK,
  packMasonryColumns,
} from '@/utils/patternDisplay';
import { youtubeThumbnailUrl } from '@/utils/youtube';

type LibraryPill = 'collections' | 'likes';
type CollectionSubTab = 'folders' | 'stories';

export default function MeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const projects = useCrochetStore((state) => state.projects);
  const patterns = useCrochetStore((state) => state.patterns);
  const progressPhotos = useCrochetStore((state) => state.progressPhotos);
  const account = useCrochetStore((state) => state.account);
  const likedPatternIds = useCrochetStore((state) => state.likedPatternIds);
  const collectedPatternIds = useCrochetStore((state) => state.collectedPatternIds);
  const collectionFolders = useCrochetStore((state) => state.collectionFolders);
  const createCollectionFolder = useCrochetStore((state) => state.createCollectionFolder);
  const renameCollectionFolder = useCrochetStore((state) => state.renameCollectionFolder);
  const deleteCollectionFolder = useCrochetStore((state) => state.deleteCollectionFolder);
  const togglePatternInFolder = useCrochetStore((state) => state.togglePatternInFolder);
  const setAccount = useCrochetStore((state) => state.setAccount);

  const [libraryPill, setLibraryPill] = useState<LibraryPill>('collections');
  const [collectionSubTab, setCollectionSubTab] = useState<CollectionSubTab>('folders');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'sign-in' | 'create' | 'edit'>('sign-in');
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderDescription, setNewFolderDescription] = useState('');
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);
  const [renameFolderOpen, setRenameFolderOpen] = useState(false);
  const [renameFolderName, setRenameFolderName] = useState('');
  const [addPatternsOpen, setAddPatternsOpen] = useState(false);
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

  const collectedPatterns = useMemo(
    () =>
      collectedPatternIds
        .map((id) => patterns.find((pattern) => pattern.id === id))
        .filter((item): item is CrochetPattern => item != null),
    [collectedPatternIds, patterns],
  );

  const likedPatterns = useMemo(
    () =>
      likedPatternIds
        .map((id) => patterns.find((pattern) => pattern.id === id))
        .filter((item): item is CrochetPattern => item != null),
    [likedPatternIds, patterns],
  );

  const openFolder = openFolderId ? collectionFolders.find((folder) => folder.id === openFolderId) ?? null : null;

  const filterPatterns = (list: CrochetPattern[]) => {
    const q = searchQuery.trim();
    if (!q) return list;
    return list.filter((pattern) => matchesPatternQuery(pattern, q));
  };

  const filterFolders = (list: IdeaFolder[]) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (folder) =>
        folder.name.toLowerCase().includes(q) ||
        folder.description.toLowerCase().includes(q) ||
        folder.patternIds.some((id) => {
          const pattern = patterns.find((item) => item.id === id);
          return pattern ? matchesPatternQuery(pattern, searchQuery) : false;
        }),
    );
  };

  const masonryPatterns = useMemo(() => {
    const q = searchQuery.trim();
    const applyQuery = (list: CrochetPattern[]) =>
      q ? list.filter((pattern) => matchesPatternQuery(pattern, q)) : list;

    if (libraryPill === 'likes') return applyQuery(likedPatterns);
    if (openFolder) {
      const inFolder = openFolder.patternIds
        .map((id) => patterns.find((pattern) => pattern.id === id))
        .filter((item): item is CrochetPattern => item != null);
      return applyQuery(inFolder);
    }
    return [];
  }, [libraryPill, likedPatterns, openFolder, patterns, searchQuery]);

  const innerWidth = Math.max(0, windowWidth - insets.left - insets.right);
  const columnWidth = Math.floor((innerWidth - Layout.screenGutter * 2 - Layout.cardGap) / 2);
  const columns =
    columnWidth > 0 ? packMasonryColumns(masonryPatterns, columnWidth, MASONRY_TEXT_BLOCK, Spacing.md) : [[], []];

  const onSignOut = async () => {
    tick();
    if (isFirebaseConfigured() && auth) {
      try {
        await signOut(auth);
      } catch {
        // Local state still clears below.
      }
    }
    setAccount(null);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
      >
        <ProfileAccountBar
          account={account}
          firebaseReady={isFirebaseConfigured()}
          hours={formatHours(totalSeconds)}
          completed={completed}
          stitches={stitches}
          onSignIn={() => {
            setAuthMode('sign-in');
            setAuthOpen(true);
          }}
          onEdit={() => {
            setAuthMode('edit');
            setAuthOpen(true);
          }}
          onSignOut={() => void onSignOut()}
        />

        <LibraryHeaderBar
          libraryPill={libraryPill}
          onPillChange={(pill) => {
            tick();
            setLibraryPill(pill);
            setOpenFolderId(null);
          }}
          searchOpen={searchOpen}
          onToggleSearch={() => {
            tick();
            setSearchOpen((open) => !open);
          }}
        />

        {searchOpen ? (
          <View style={styles.searchPill}>
            <SearchIcon color={Colors.textSecondary} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={libraryPill === 'likes' ? 'Search liked patterns' : 'Search library'}
              placeholderTextColor={Colors.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              selectionColor={Colors.accentPrimary}
              style={styles.searchInput}
            />
            {searchQuery.length > 0 ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setSearchQuery('')}>
                <Text style={styles.clearGlyph}>×</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {libraryPill === 'collections' && !openFolder ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.categoryScroll}
            contentContainerStyle={styles.categoryContent}
          >
            {(
              [
                ['folders', 'Folders'],
                ['stories', 'Stories'],
              ] as const
            ).map(([id, label]) => {
              const selected = collectionSubTab === id;
              return (
                <Pressable
                  key={id}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    tick();
                    setCollectionSubTab(id);
                  }}
                  style={({ pressed }) => [styles.categoryTab, pressed && styles.pressed, webCursor]}
                >
                  <Text style={[styles.categoryLabel, selected && styles.categoryLabelActive]}>{label}</Text>
                  <View style={[styles.categoryIndicator, selected && styles.categoryIndicatorActive]} />
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        {libraryPill === 'collections' && openFolder ? (
          <View style={styles.folderDrillHeader}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back to folders"
              onPress={() => {
                tick();
                setOpenFolderId(null);
              }}
              style={({ pressed }) => [styles.backLink, pressed && styles.pressed, webCursor]}
            >
              <Text style={styles.backLinkText}>‹ Back to Folders</Text>
            </Pressable>
            <Text role="heading" aria-level={2} style={styles.folderDrillTitle}>
              {openFolder.name}
            </Text>
            <View style={styles.folderDrillActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add patterns to folder"
                onPress={() => {
                  tick();
                  setAddPatternsOpen(true);
                }}
                style={({ pressed }) => [styles.secondaryPill, pressed && styles.pressed, webCursor]}
              >
                <Text style={styles.secondaryPillText}>+ Add Patterns</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Rename folder"
                onPress={() => {
                  tick();
                  setRenameFolderName(openFolder.name);
                  setRenameFolderOpen(true);
                }}
                style={({ pressed }) => [styles.ghostPill, pressed && styles.pressed, webCursor]}
              >
                <Text style={styles.ghostPillText}>Rename</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Delete folder"
                onPress={() => {
                  tick();
                  deleteCollectionFolder(openFolder.id);
                  setOpenFolderId(null);
                }}
                style={({ pressed }) => [pressed && styles.pressed, webCursor]}
              >
                <Text style={styles.dangerText}>Delete</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {libraryPill === 'likes' || openFolder ? (
          <PatternMasonrySection
            patterns={masonryPatterns}
            columns={columns}
            columnWidth={columnWidth}
            emptyTitle={
              libraryPill === 'likes' ? 'No liked patterns yet' : 'No patterns in this folder'
            }
            emptyBody={
              libraryPill === 'likes'
                ? 'Tap the heart on any pattern in the feed to save it here.'
                : 'Use + Add Patterns to fill this folder from your collection.'
            }
            forceLikedVisual={libraryPill === 'likes'}
            onOpenPattern={(id) => {
              tick();
              setPatternId(id);
            }}
          />
        ) : null}

        {libraryPill === 'collections' && collectionSubTab === 'folders' && !openFolder ? (
          <View style={styles.section}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="New folder"
              onPress={() => {
                tick();
                setFolderModalOpen(true);
              }}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, webCursor]}
            >
              <Text style={styles.primaryButtonText}>+ New Folder</Text>
            </Pressable>
            {filterFolders(collectionFolders).length === 0 ? (
              <Text style={styles.empty}>
                {collectionFolders.length === 0
                  ? 'Create folders for gifts, seasonal makes, or works in progress.'
                  : 'No folders match your search.'}
              </Text>
            ) : (
              <View style={styles.folderGrid}>
                {filterFolders(collectionFolders).map((folder) => (
                  <FolderTile
                    key={folder.id}
                    folder={folder}
                    patterns={patterns}
                    onPress={() => {
                      tick();
                      setOpenFolderId(folder.id);
                    }}
                  />
                ))}
              </View>
            )}
          </View>
        ) : null}

        {libraryPill === 'collections' && collectionSubTab === 'stories' ? (
          <View style={styles.section}>
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
                  <View style={styles.storyCopy}>
                    <Text numberOfLines={1} style={styles.storyTitle}>
                      {story.name}
                    </Text>
                    <Text style={styles.storyMeta}>
                      {story.count} {story.count === 1 ? 'still' : 'stills'} · Row {story.latestRow}/{story.totalRows}
                    </Text>
                  </View>
                  <Text style={styles.watchLabel}>Watch</Text>
                </Pressable>
              ))
            )}
          </View>
        ) : null}
      </ScrollView>

      <BottomSheet
        visible={folderModalOpen}
        onClose={() => setFolderModalOpen(false)}
        header={
          <View style={styles.sheetHeader}>
            <Text role="heading" aria-level={2} style={styles.sheetTitle}>
              New folder
            </Text>
            <Text style={styles.sheetSubtitle}>Group patterns for your next makes.</Text>
          </View>
        }
        footer={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Create folder"
            onPress={() => {
              const name = newFolderName.trim();
              if (!name) return;
              createCollectionFolder({ name, description: newFolderDescription.trim() });
              setNewFolderName('');
              setNewFolderDescription('');
              setFolderModalOpen(false);
              setCollectionSubTab('folders');
            }}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, webCursor]}
          >
            <Text style={styles.primaryButtonText}>Create folder</Text>
          </Pressable>
        }
      >
        <View style={styles.sheetBody}>
          <Text style={styles.sheetLabel}>Name</Text>
          <TextInput
            value={newFolderName}
            onChangeText={setNewFolderName}
            placeholder="Amigurumi gifts"
            placeholderTextColor={Colors.textTertiary}
            selectionColor={Colors.accentPrimary}
            style={styles.sheetInput}
          />
          <Text style={styles.sheetLabel}>Description</Text>
          <TextInput
            value={newFolderDescription}
            onChangeText={setNewFolderDescription}
            placeholder="Optional notes"
            placeholderTextColor={Colors.textTertiary}
            selectionColor={Colors.accentPrimary}
            multiline
            style={[styles.sheetInput, styles.sheetInputMultiline]}
          />
        </View>
      </BottomSheet>

      <BottomSheet
        visible={renameFolderOpen && openFolder != null}
        onClose={() => setRenameFolderOpen(false)}
        header={
          <Text role="heading" aria-level={2} style={styles.sheetTitle}>
            Rename folder
          </Text>
        }
        footer={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Save folder name"
            onPress={() => {
              if (!openFolder) return;
              const name = renameFolderName.trim();
              if (!name) return;
              renameCollectionFolder(openFolder.id, name);
              setRenameFolderOpen(false);
            }}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, webCursor]}
          >
            <Text style={styles.primaryButtonText}>Save</Text>
          </Pressable>
        }
      >
        <TextInput
          value={renameFolderName}
          onChangeText={setRenameFolderName}
          placeholder="Folder name"
          placeholderTextColor={Colors.textTertiary}
          selectionColor={Colors.accentPrimary}
          style={styles.sheetInput}
        />
      </BottomSheet>

      <BottomSheet
        visible={addPatternsOpen && openFolder != null}
        onClose={() => setAddPatternsOpen(false)}
        header={
          <Text role="heading" aria-level={2} style={styles.sheetTitle}>
            Add patterns
          </Text>
        }
      >
        {openFolder ? (
          <ScrollView style={styles.addPatternList} nestedScrollEnabled>
            {collectedPatterns.length === 0 ? (
              <Text style={styles.empty}>Collect patterns first from the Patterns tab or detail sheet.</Text>
            ) : (
              collectedPatterns.map((pattern) => {
                const inFolder = openFolder.patternIds.includes(pattern.id);
                return (
                  <Pressable
                    key={pattern.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: inFolder }}
                    onPress={() => {
                      tick();
                      togglePatternInFolder(openFolder.id, pattern.id);
                    }}
                    style={({ pressed }) => [styles.addPatternRow, inFolder && styles.addPatternRowOn, pressed && styles.pressed, webCursor]}
                  >
                    <Image
                      accessible={false}
                      source={{ uri: youtubeThumbnailUrl(pattern.videoId, 'hq') }}
                      style={styles.addPatternThumb}
                    />
                    <Text numberOfLines={2} style={styles.addPatternTitle}>
                      {pattern.title}
                    </Text>
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        ) : null}
      </BottomSheet>

      <AuthAccountModal visible={authOpen} initialMode={authMode} onClose={() => setAuthOpen(false)} />
      <PatternDetailSheet
        patternId={patternId}
        onClose={() => setPatternId(null)}
        onPatternChange={setPatternId}
        onTagPress={(tag) => {
          const normalized = normalizePatternTag(tag);
          if (!normalized) return;
          setPatternId(null);
          tick();
          router.push({ pathname: '/(tabs)', params: { tag: normalized } });
        }}
      />
      <PhotoProgressModal
        visible={storyProjectId != null}
        projectId={storyProjectId}
        initialView="reel"
        onClose={() => setStoryProjectId(null)}
      />
    </View>
  );
}

function ProfileAccountBar({
  account,
  firebaseReady,
  hours,
  completed,
  stitches,
  onSignIn,
  onEdit,
  onSignOut,
}: {
  account: UserAccount | null;
  firebaseReady: boolean;
  hours: string;
  completed: number;
  stitches: number;
  onSignIn: () => void;
  onEdit: () => void;
  onSignOut: () => void;
}) {
  return (
    <View style={styles.profileBar}>
      {account ? (
        <View style={styles.profileRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Edit profile"
            onPress={onEdit}
            style={({ pressed }) => [styles.profileIdentity, pressed && styles.pressed, webCursor]}
          >
            <View style={[styles.profileAvatar, { backgroundColor: account.avatarColor }]}>
              <Text style={styles.profileAvatarText}>{creatorInitials(account.displayName)}</Text>
            </View>
            <View style={styles.profileCopy}>
              <Text numberOfLines={1} style={styles.profileName}>{account.displayName}</Text>
              <Text numberOfLines={1} style={styles.profileHandle}>@{account.username}</Text>
            </View>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Sign out" onPress={onSignOut} hitSlop={Layout.hitSlop}>
            <Text style={styles.signOutLink}>Sign out</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sign in or create account"
          onPress={onSignIn}
          style={({ pressed }) => [styles.signInCta, pressed && styles.pressed, webCursor]}
        >
          <Text style={styles.signInCtaText}>Sign In / Create Account</Text>
          {!firebaseReady ? (
            <Text style={styles.profileNote}>Firebase not configured — local profile only.</Text>
          ) : null}
        </Pressable>
      )}
      <View style={styles.statPills}>
        <MiniStat label="Hours" value={hours} />
        <MiniStat label="Completed" value={String(completed)} />
        <MiniStat label="Stitches" value={stitches.toLocaleString()} />
      </View>
    </View>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.miniStat}>
      <Text style={styles.miniStatValue}>{value}</Text>
      <Text style={styles.miniStatLabel}>{label}</Text>
    </View>
  );
}

function LibraryHeaderBar({
  libraryPill,
  onPillChange,
  searchOpen,
  onToggleSearch,
}: {
  libraryPill: LibraryPill;
  onPillChange: (pill: LibraryPill) => void;
  searchOpen: boolean;
  onToggleSearch: () => void;
}) {
  return (
    <View style={styles.libraryHeader}>
      <View style={styles.libraryHeaderSide} />
      <View accessibilityRole="tablist" style={styles.topPill}>
        <TopPillTab label="Collections" selected={libraryPill === 'collections'} onPress={() => onPillChange('collections')} />
        <TopPillTab label="Likes" selected={libraryPill === 'likes'} onPress={() => onPillChange('likes')} />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={searchOpen ? 'Close search' : 'Search library'}
        accessibilityState={{ expanded: searchOpen }}
        onPress={onToggleSearch}
        style={({ pressed }) => [styles.searchButton, pressed && styles.pressed, webCursor]}
      >
        <SearchIcon color={searchOpen ? Colors.accentPrimary : Colors.textPrimary} />
      </Pressable>
    </View>
  );
}

function TopPillTab({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.topPillTab, selected && styles.topPillTabOn, pressed && styles.pressed, webCursor]}
    >
      <Text style={[styles.topPillText, selected && styles.topPillTextOn]}>{label}</Text>
    </Pressable>
  );
}

function PatternMasonrySection({
  patterns: patternList,
  columns,
  columnWidth,
  emptyTitle,
  emptyBody,
  forceLikedVisual,
  onOpenPattern,
}: {
  patterns: CrochetPattern[];
  columns: { pattern: CrochetPattern; imageHeight: number }[][] ;
  columnWidth: number;
  emptyTitle: string;
  emptyBody: string;
  forceLikedVisual?: boolean;
  onOpenPattern: (id: string) => void;
}) {
  if (patternList.length === 0) {
    return (
      <View style={styles.emptyBlock}>
        <Text style={styles.emptyTitle}>{emptyTitle}</Text>
        <Text style={styles.empty}>{emptyBody}</Text>
      </View>
    );
  }
  if (columnWidth <= 0) return null;
  return (
    <View style={styles.masonry}>
      {columns.map((column, columnIndex) => (
        <View key={columnIndex} style={[styles.column, { width: columnWidth }]}>
          {column.map(({ pattern, imageHeight }) => (
            <PatternFeedCard
              key={pattern.id}
              pattern={pattern}
              imageHeight={imageHeight}
              forceLikedVisual={forceLikedVisual}
              onPress={() => onOpenPattern(pattern.id)}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

function FolderTile({
  folder,
  patterns,
  onPress,
}: {
  folder: IdeaFolder;
  patterns: CrochetPattern[];
  onPress: () => void;
}) {
  const thumbs = folder.patternIds
    .slice(0, 4)
    .map((id) => patterns.find((pattern) => pattern.id === id))
    .filter((item): item is CrochetPattern => item != null);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${folder.name}, ${folder.patternIds.length} patterns`}
      onPress={onPress}
      style={({ pressed }) => [styles.folderTile, pressed && styles.pressed, webCursor]}
    >
      <View style={styles.folderCollage}>
        {thumbs.length === 0 ? (
          <View style={styles.folderCollageEmpty} />
        ) : (
          thumbs.map((pattern, index) => (
            <Image
              key={pattern.id}
              accessible={false}
              source={{ uri: youtubeThumbnailUrl(pattern.videoId, 'hq') }}
              style={[styles.folderCollageCell, index % 2 === 1 && styles.folderCollageCellRight]}
            />
          ))
        )}
      </View>
      <Text numberOfLines={2} style={styles.folderTileTitle}>{folder.name}</Text>
      <Text style={styles.folderTileMeta}>
        {folder.patternIds.length} {folder.patternIds.length === 1 ? 'pattern' : 'patterns'}
      </Text>
    </Pressable>
  );
}

function SearchIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Circle cx={11} cy={11} r={6.5} stroke={color} strokeWidth={1.8} />
      <Path d="M16 16 L20.5 20.5" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

function formatHours(totalSeconds: number): string {
  const hours = totalSeconds / 3600;
  if (!Number.isFinite(hours) || hours <= 0) return '0';
  if (hours < 10) return (Math.round(hours * 10) / 10).toFixed(1);
  return Math.round(hours).toLocaleString();
}

function tick() {
  if (Platform.OS === 'web') return;
  void Haptics.selectionAsync();
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
    gap: Spacing.md,
  },
  profileBar: {
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.cardSurface,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  profileIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    flex: 1,
  },
  profileAvatar: {
    width: 48,
    height: 48,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatarText: {
    ...Typography.label,
    color: Colors.textPrimary,
    fontWeight: FontWeight.bold,
  },
  profileCopy: {
    flex: 1,
    gap: 2,
  },
  profileName: {
    ...Typography.subhead,
    color: Colors.textPrimary,
    fontWeight: FontWeight.bold,
  },
  profileHandle: {
    ...Typography.caption,
    color: Colors.accentPrimary,
    fontWeight: FontWeight.semibold,
  },
  signOutLink: {
    ...Typography.caption,
    color: Colors.textSecondary,
    alignSelf: 'flex-end',
  },
  signInCta: {
    gap: 4,
  },
  signInCtaText: {
    ...Typography.label,
    color: Colors.accentPrimary,
    fontWeight: FontWeight.bold,
  },
  profileNote: {
    ...Typography.caption,
    color: Colors.textTertiary,
  },
  statPills: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  miniStat: {
    flex: 1,
    borderRadius: Radius.md,
    backgroundColor: Colors.elevatedControl,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    alignItems: 'center',
    gap: 2,
  },
  miniStatValue: {
    fontFamily: FontFamily.medium,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  miniStatLabel: {
    ...Typography.caption,
    color: Colors.textSecondary,
    fontSize: 10,
  },
  libraryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  libraryHeaderSide: {
    width: 40,
  },
  topPill: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: Radius.md,
    backgroundColor: Colors.cardSurface,
    gap: 2,
  },
  topPillTab: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.sm,
    minWidth: 96,
    alignItems: 'center',
  },
  topPillTabOn: {
    backgroundColor: Colors.elevatedControl,
  },
  topPillText: {
    ...Typography.caption,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
  },
  topPillTextOn: {
    color: Colors.textPrimary,
    fontWeight: FontWeight.bold,
  },
  searchButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: 40,
    borderRadius: Radius.pill,
    backgroundColor: Colors.elevatedControl,
    paddingHorizontal: Spacing.md,
  },
  searchInput: {
    flex: 1,
    ...Typography.body,
    color: Colors.textPrimary,
    paddingVertical: 0,
  },
  clearGlyph: {
    color: Colors.textSecondary,
    fontSize: 22,
    lineHeight: 24,
  },
  categoryScroll: {
    flexGrow: 0,
  },
  categoryContent: {
    gap: Spacing.xl,
    alignItems: 'center',
    paddingBottom: Spacing.xs,
  },
  categoryTab: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: Spacing.xxs,
  },
  categoryLabel: {
    ...Typography.label,
    color: Colors.textPrimary,
  },
  categoryLabelActive: {
    color: Colors.accentPrimary,
  },
  categoryIndicator: {
    width: 18,
    height: 3,
    borderRadius: Radius.pill,
    backgroundColor: Colors.transparent,
  },
  categoryIndicatorActive: {
    backgroundColor: Colors.accentPrimary,
    ...Platform.select({
      web: { boxShadow: '0 0 8px rgba(0, 230, 118, 0.9)' },
      default: {
        shadowColor: Colors.accentPrimary,
        shadowOpacity: 0.95,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 0 },
        elevation: 6,
      },
    }),
  },
  folderDrillHeader: {
    gap: Spacing.sm,
  },
  backLink: {
    alignSelf: 'flex-start',
  },
  backLinkText: {
    ...Typography.label,
    color: Colors.accentPrimary,
    fontWeight: FontWeight.semibold,
  },
  folderDrillTitle: {
    ...Typography.headline,
    color: Colors.textPrimary,
  },
  folderDrillActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  secondaryPill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.pill,
    backgroundColor: Colors.accentPrimary,
  },
  secondaryPillText: {
    ...Typography.caption,
    color: Colors.onAccent,
    fontWeight: FontWeight.bold,
  },
  ghostPill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.pill,
    backgroundColor: Colors.elevatedControl,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  ghostPillText: {
    ...Typography.caption,
    color: Colors.textPrimary,
    fontWeight: FontWeight.semibold,
  },
  dangerText: {
    ...Typography.caption,
    color: Colors.danger,
    fontWeight: FontWeight.semibold,
  },
  masonry: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Layout.cardGap,
  },
  column: {
    gap: Layout.cardGap,
  },
  section: {
    gap: Spacing.md,
  },
  folderGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Layout.cardGap,
  },
  folderTile: {
    width: '48%',
    flexGrow: 1,
    maxWidth: '48%',
    backgroundColor: Colors.cardSurface,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    gap: Spacing.sm,
  },
  folderCollage: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    aspectRatio: 1,
    borderRadius: Radius.sm,
    overflow: 'hidden',
    backgroundColor: Colors.elevatedControl,
  },
  folderCollageEmpty: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  folderCollageCell: {
    width: '50%',
    height: '50%',
  },
  folderCollageCellRight: {},
  folderTileTitle: {
    ...Typography.label,
    color: Colors.textPrimary,
    minHeight: 36,
  },
  folderTileMeta: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accentPrimary,
  },
  primaryButtonText: {
    ...Typography.label,
    color: Colors.onAccent,
    fontWeight: FontWeight.bold,
  },
  emptyBlock: {
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  emptyTitle: {
    ...Typography.subhead,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  empty: {
    ...Typography.callout,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  storyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.cardSurface,
  },
  storyCover: {
    width: 56,
    height: 56,
    borderRadius: Radius.md,
    backgroundColor: Colors.elevatedControl,
  },
  storyCoverEmpty: {
    opacity: 0.5,
  },
  storyCopy: {
    flex: 1,
    gap: 4,
  },
  storyTitle: {
    ...Typography.label,
    color: Colors.textPrimary,
  },
  storyMeta: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  watchLabel: {
    ...Typography.caption,
    color: Colors.accentPrimary,
    fontWeight: FontWeight.bold,
  },
  sheetHeader: {
    gap: 4,
    paddingHorizontal: Layout.screenGutter,
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
    gap: Spacing.md,
    paddingHorizontal: Layout.screenGutter,
  },
  sheetLabel: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  sheetInput: {
    ...Typography.body,
    minHeight: 48,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    color: Colors.textPrimary,
    backgroundColor: Colors.elevatedControl,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sheetInputMultiline: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  addPatternList: {
    maxHeight: 360,
    paddingHorizontal: Layout.screenGutter,
  },
  addPatternRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.elevatedControl,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.transparent,
  },
  addPatternRowOn: {
    backgroundColor: Colors.accentMuted,
    borderColor: Colors.accentPrimary,
  },
  addPatternThumb: {
    width: 48,
    height: 48,
    borderRadius: Radius.sm,
    backgroundColor: Colors.cardSurface,
  },
  addPatternTitle: {
    ...Typography.caption,
    color: Colors.textPrimary,
    flex: 1,
    fontWeight: FontWeight.semibold,
  },
  pressed: {
    opacity: 0.72,
  },
});
