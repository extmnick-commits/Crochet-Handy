/**
 * Me — profile stats, saved patterns, and story reels.
 */
import * as Haptics from 'expo-haptics';
import { signOut } from 'firebase/auth';
import { useEffect, useMemo, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthAccountModal } from '@/components/AuthAccountModal';
import { PatternDetailSheet } from '@/components/PatternDetailSheet';
import { PhotoProgressModal } from '@/components/PhotoProgressModal';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Colors, FontFamily, FontWeight, Layout, Radius, Spacing, Typography } from '@/constants/BambuTheme';
import {
  elapsedSeconds,
  stitchesDone,
  useCrochetStore,
  type IdeaFolder,
  type UserAccount,
  type CrochetPattern,
} from '@/store/useCrochetStore';
import { auth, isFirebaseConfigured } from '@/utils/firebase';
import { creatorInitials, yarnWeightMeta } from '@/utils/patternDisplay';
import { youtubeThumbnailUrl } from '@/utils/youtube';

type LibraryTab = 'stories' | 'folders';

export default function MeScreen() {
  const insets = useSafeAreaInsets();
  const projects = useCrochetStore((state) => state.projects);
  const patterns = useCrochetStore((state) => state.patterns);
  const progressPhotos = useCrochetStore((state) => state.progressPhotos);
  const account = useCrochetStore((state) => state.account);
  const likedPatternIds = useCrochetStore((state) => state.likedPatternIds);
  const ideaFolders = useCrochetStore((state) => state.ideaFolders);
  const createIdeaFolder = useCrochetStore((state) => state.createIdeaFolder);
  const deleteIdeaFolder = useCrochetStore((state) => state.deleteIdeaFolder);
  const togglePatternInFolder = useCrochetStore((state) => state.togglePatternInFolder);
  const setAccount = useCrochetStore((state) => state.setAccount);
  const [tab, setTab] = useState<LibraryTab>('stories');
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'sign-in' | 'create' | 'edit'>('sign-in');
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderDescription, setNewFolderDescription] = useState('');
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);
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

  const likedPatterns = useMemo(
    () => likedPatternIds.map((id) => patterns.find((pattern) => pattern.id === id)).filter((item) => item != null),
    [likedPatternIds, patterns],
  );

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
          <Text style={styles.subtitle}>Profile & library</Text>
        </View>

        <View style={styles.stats}>
          <Stat testID="stat-hours" value={formatHours(totalSeconds)} label="Total hours crocheted" />
          <Stat testID="stat-completed" value={String(completed)} label="Completed projects" />
          <Stat testID="stat-stitches" value={stitches.toLocaleString()} label="Total stitches" />
        </View>

        <AccountProfileCard
          account={account}
          firebaseReady={isFirebaseConfigured()}
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

        <View accessibilityRole="tablist" style={styles.segment}>
          <Segment
            testID="patterns-stories-tab"
            label="Saved Patterns & Stories"
            selected={tab === 'stories'}
            onPress={() => {
              tick();
              setTab('stories');
            }}
          />
          <Segment
            testID="folders-likes-tab"
            label="Folders & Likes"
            selected={tab === 'folders'}
            onPress={() => {
              tick();
              setTab('folders');
            }}
          />
        </View>

        {tab === 'stories' ? (
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
        ) : (
          <View style={styles.section}>
            <Text role="heading" aria-level={2} style={styles.sectionTitle}>
              Idea folders
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="New idea folder"
              onPress={() => {
                tick();
                setFolderModalOpen(true);
              }}
              style={({ pressed }) => [styles.addButton, pressed && styles.pressed, webCursor]}
            >
              <Text style={styles.addButtonText}>+ New Idea Folder</Text>
            </Pressable>
            {ideaFolders.length === 0 ? (
              <Text style={styles.empty}>Save patterns from the feed into folders to plan your next makes.</Text>
            ) : (
              ideaFolders.map((folder) => (
                <FolderCard
                  key={folder.id}
                  folder={folder}
                  patterns={patterns}
                  expanded={openFolderId === folder.id}
                  onToggle={() => {
                    tick();
                    setOpenFolderId((current) => (current === folder.id ? null : folder.id));
                  }}
                  onOpenPattern={(id) => {
                    tick();
                    setPatternId(id);
                  }}
                  onRemovePattern={(patternIdToRemove) => {
                    tick();
                    togglePatternInFolder(folder.id, patternIdToRemove);
                  }}
                  onDelete={() => {
                    tick();
                    deleteIdeaFolder(folder.id);
                    if (openFolderId === folder.id) setOpenFolderId(null);
                  }}
                />
              ))
            )}

            <Text role="heading" aria-level={2} style={styles.sectionTitle}>
              Liked patterns
            </Text>
            {likedPatterns.length === 0 ? (
              <Text style={styles.empty}>Tap the heart on any tutorial in Patterns to collect it here.</Text>
            ) : (
              likedPatterns.map((pattern) => (
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
                      {pattern.creator}
                    </Text>
                  </View>
                </Pressable>
              ))
            )}
          </View>
        )}
      </ScrollView>

      <BottomSheet
        visible={folderModalOpen}
        onClose={() => setFolderModalOpen(false)}
        header={
          <View style={styles.sheetHeader}>
            <Text role="heading" aria-level={2} style={styles.sheetTitle}>
              New idea folder
            </Text>
            <Text style={styles.sheetSubtitle}>Group patterns you want to try next.</Text>
          </View>
        }
        footer={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Create folder"
            onPress={() => {
              const name = newFolderName.trim();
              if (!name) return;
              createIdeaFolder({ name, description: newFolderDescription.trim() });
              setNewFolderName('');
              setNewFolderDescription('');
              setFolderModalOpen(false);
            }}
            style={({ pressed }) => [styles.addButton, pressed && styles.pressed, webCursor]}
          >
            <Text style={styles.addButtonText}>Create folder</Text>
          </Pressable>
        }
      >
        <View style={styles.sheetBody}>
          <Text style={styles.sheetLabel}>Name</Text>
          <TextInput
            value={newFolderName}
            onChangeText={setNewFolderName}
            placeholder="Weekend amigurumi"
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

      <AuthAccountModal visible={authOpen} initialMode={authMode} onClose={() => setAuthOpen(false)} />
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

function AccountProfileCard({
  account,
  firebaseReady,
  onSignIn,
  onEdit,
  onSignOut,
}: {
  account: UserAccount | null;
  firebaseReady: boolean;
  onSignIn: () => void;
  onEdit: () => void;
  onSignOut: () => void;
}) {
  if (!account) {
    return (
      <View style={styles.profileCard}>
        <Text style={styles.profileTitle}>Back up your crochet progress</Text>
        <Text style={styles.profileBody}>
          Sign in to sync projects, liked tutorials, and idea folders across devices.
        </Text>
        {!firebaseReady ? (
          <Text style={styles.profileNote}>
            Firebase keys are not configured yet — you can still create a local profile below.
          </Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sign in or create account"
          onPress={onSignIn}
          style={({ pressed }) => [styles.addButton, pressed && styles.pressed, webCursor]}
        >
          <Text style={styles.addButtonText}>Sign In / Create Account</Text>
        </Pressable>
      </View>
    );
  }

  const cloudLabel = firebaseReady && !account.uid.startsWith('local-') ? 'Cloud sync on' : 'Local profile';

  return (
    <View style={styles.profileCard}>
      <View style={styles.profileHeader}>
        <View style={[styles.profileAvatar, { backgroundColor: account.avatarColor }]}>
          <Text style={styles.profileAvatarText}>{creatorInitials(account.displayName)}</Text>
        </View>
        <View style={styles.profileCopy}>
          <Text style={styles.profileName}>{account.displayName}</Text>
          <Text style={styles.profileHandle}>@{account.username}</Text>
          <Text style={styles.profileEmail}>{account.email}</Text>
        </View>
      </View>
      {account.bio ? <Text style={styles.profileBio}>{account.bio}</Text> : null}
      <View style={styles.syncBadge}>
        <Text style={styles.syncBadgeText}>{cloudLabel}</Text>
      </View>
      <View style={styles.profileActions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Edit profile"
          onPress={onEdit}
          style={({ pressed }) => [styles.profileButton, pressed && styles.pressed, webCursor]}
        >
          <Text style={styles.profileButtonText}>Edit Profile</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          onPress={onSignOut}
          style={({ pressed }) => [styles.profileButtonGhost, pressed && styles.pressed, webCursor]}
        >
          <Text style={styles.profileButtonGhostText}>Sign Out</Text>
        </Pressable>
      </View>
    </View>
  );
}

function FolderCard({
  folder,
  patterns,
  expanded,
  onToggle,
  onOpenPattern,
  onRemovePattern,
  onDelete,
}: {
  folder: IdeaFolder;
  patterns: CrochetPattern[];
  expanded: boolean;
  onToggle: () => void;
  onOpenPattern: (patternId: string) => void;
  onRemovePattern: (patternId: string) => void;
  onDelete: () => void;
}) {
  const preview = folder.patternIds
    .slice(0, 3)
    .map((id) => patterns.find((pattern) => pattern.id === id))
    .filter((item): item is CrochetPattern => item != null);

  const saved = folder.patternIds
    .map((id) => patterns.find((pattern) => pattern.id === id))
    .filter((item): item is CrochetPattern => item != null);

  return (
    <View style={styles.folderCard}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={onToggle}
        style={({ pressed }) => [styles.folderCardHeader, pressed && styles.pressed, webCursor]}
      >
        <View style={styles.folderCardCopy}>
          <Text style={styles.folderCardTitle}>{folder.name}</Text>
          {folder.description ? (
            <Text numberOfLines={2} style={styles.folderCardDescription}>
              {folder.description}
            </Text>
          ) : null}
          <Text style={styles.folderCardMeta}>
            {folder.patternIds.length} {folder.patternIds.length === 1 ? 'pattern' : 'patterns'}
          </Text>
        </View>
        <View style={styles.folderPreviewStrip}>
          {preview.length === 0 ? (
            <View style={styles.folderPreviewEmpty} />
          ) : (
            preview.map((pattern) => (
              <Image
                key={pattern.id}
                accessible={false}
                source={{ uri: youtubeThumbnailUrl(pattern.videoId, 'hq') }}
                style={styles.folderPreviewThumb}
              />
            ))
          )}
        </View>
      </Pressable>
      {expanded ? (
        <View style={styles.folderExpanded}>
          {saved.length === 0 ? (
            <Text style={styles.empty}>No patterns in this folder yet.</Text>
          ) : (
            saved.map((pattern) => (
              <View key={pattern.id} style={styles.folderPatternRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={pattern.title}
                  onPress={() => onOpenPattern(pattern.id)}
                  style={({ pressed }) => [styles.patternRow, pressed && styles.pressed, webCursor, { flex: 1 }]}
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
                  </View>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Remove from folder"
                  onPress={() => onRemovePattern(pattern.id)}
                  hitSlop={Layout.hitSlop}
                  style={({ pressed }) => [pressed && styles.pressed, webCursor]}
                >
                  <Text style={styles.remove}>Remove</Text>
                </Pressable>
              </View>
            ))
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Delete folder"
            onPress={onDelete}
            style={({ pressed }) => [pressed && styles.pressed, webCursor]}
          >
            <Text style={styles.remove}>Delete folder</Text>
          </Pressable>
        </View>
      ) : null}
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

function formatHours(totalSeconds: number): string {
  const hours = totalSeconds / 3600;
  if (!Number.isFinite(hours) || hours <= 0) return '0';
  if (hours < 10) return (Math.round(hours * 10) / 10).toFixed(1);
  return Math.round(hours).toLocaleString();
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
  profileCard: {
    borderRadius: Radius.lg,
    backgroundColor: Colors.cardSurface,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  profileTitle: {
    ...Typography.headline,
    color: Colors.textPrimary,
  },
  profileBody: {
    ...Typography.callout,
    color: Colors.textSecondary,
  },
  profileNote: {
    ...Typography.caption,
    color: Colors.textTertiary,
  },
  profileHeader: {
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'center',
  },
  profileAvatar: {
    width: 64,
    height: 64,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatarText: {
    ...Typography.headline,
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
  profileEmail: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  profileBio: {
    ...Typography.callout,
    color: Colors.textPrimary,
  },
  syncBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xxs,
    borderRadius: Radius.pill,
    backgroundColor: Colors.accentMuted,
  },
  syncBadgeText: {
    ...Typography.caption,
    color: Colors.accentPrimary,
    fontWeight: FontWeight.semibold,
  },
  profileActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  profileButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accentPrimary,
  },
  profileButtonText: {
    ...Typography.caption,
    color: Colors.onAccent,
    fontWeight: FontWeight.bold,
  },
  profileButtonGhost: {
    flex: 1,
    minHeight: 44,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.elevatedControl,
  },
  profileButtonGhostText: {
    ...Typography.caption,
    color: Colors.textPrimary,
    fontWeight: FontWeight.semibold,
  },
  folderCard: {
    borderRadius: Radius.lg,
    backgroundColor: Colors.cardSurface,
    overflow: 'hidden',
  },
  folderCardHeader: {
    flexDirection: 'row',
    gap: Spacing.md,
    padding: Spacing.md,
    alignItems: 'center',
  },
  folderCardCopy: {
    flex: 1,
    gap: 4,
  },
  folderCardTitle: {
    ...Typography.label,
    color: Colors.textPrimary,
  },
  folderCardDescription: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  folderCardMeta: {
    ...Typography.caption,
    color: Colors.textTertiary,
  },
  folderPreviewStrip: {
    flexDirection: 'row',
    gap: 4,
  },
  folderPreviewThumb: {
    width: 40,
    height: 40,
    borderRadius: Radius.sm,
    backgroundColor: Colors.elevatedControl,
  },
  folderPreviewEmpty: {
    width: 40,
    height: 40,
    borderRadius: Radius.sm,
    backgroundColor: Colors.elevatedControl,
  },
  folderExpanded: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
    borderTopWidth: Layout.hairline,
    borderTopColor: Colors.border,
  },
  folderPatternRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
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
  remove: {
    ...Typography.caption,
    color: Colors.danger,
    fontWeight: FontWeight.semibold,
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
