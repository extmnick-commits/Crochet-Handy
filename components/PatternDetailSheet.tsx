/**
 * Full-screen pattern detail (Bambu Handy / MakerWorld style).
 */
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { PatternTutorialVideo } from '@/components/media/PatternTutorialVideo';
import { CrochetHelperHost } from '@/components/helper/CrochetHelperHost';
import { dismissCrochetHelper } from '@/utils/helper/session';
import { HeartIcon } from '@/components/HeartIcon';
import { PatternFeedCard } from '@/components/PatternFeedCard';
import { SaveToFolderSheet } from '@/components/SaveToFolderSheet';
import { handlePatternCollectPress } from '@/utils/instantCollect';
import { Colors, FontWeight, Layout, Radius, Spacing, Typography } from '@/constants/BambuTheme';
import {
  selectIsCreatorFollowed,
  selectIsPatternLiked,
  useCrochetStore,
  type CrochetPattern,
  type CrochetProject,
  type PatternComment,
  type YarnStashItem,
} from '@/store/useCrochetStore';
import { formatBookmarkTime } from '@/utils/chapters';
import {
  creatorColor,
  creatorInitials,
  difficultyLabel,
  formatCollectCount,
  formatCommentCount,
  formatHookSize,
  formatLikeCount,
  formatMakeCount,
  formatSpecBadge,
  formatViewCount,
  getPatternExtendedMeta,
  getRelatedPatterns,
  packMasonryColumns,
  yarnSizeLabel,
} from '@/utils/patternDisplay';
import { patternDescriptionAddsDetail } from '@/utils/patternSummary';
import { patternPosterUri } from '@/utils/youtube';
import { catalogPreviewDecision, patternToNewInput } from '@/utils/catalogPreview';
import { openActiveProjectTab } from '@/utils/openActiveProjectTab';

type PatternDetailSheetProps = {
  patternId: string | null;
  /** Catalog pattern shown before it is saved into the library. */
  previewPattern?: CrochetPattern | null;
  onClose: () => void;
  onDismiss?: () => void;
  /** Called after an explicit save-and-start so the yarn sheet stays closed. */
  onPreviewStarted?: () => void;
  onPatternChange?: (patternId: string) => void;
  /** Opens the feed filtered to patterns sharing this tag. */
  onTagPress?: (tag: string) => void;
};

type DetailTab = 'details' | 'bom' | 'reviews' | 'for-you';

const TABS: { id: DetailTab; label: string }[] = [
  { id: 'details', label: 'Details' },
  { id: 'bom', label: 'BOM' },
  { id: 'reviews', label: 'Reviews' },
  { id: 'for-you', label: 'For you' },
];

type Swatch = { hex: string; name: string };

const EMPTY_PATTERN_COMMENTS: PatternComment[] = [];

export function PatternDetailSheet({
  patternId,
  previewPattern = null,
  onClose,
  onDismiss,
  onPreviewStarted,
  onPatternChange,
  onTagPress,
}: PatternDetailSheetProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const sectionOffsets = useRef<Partial<Record<DetailTab, number>>>({});

  const storedPattern = useCrochetStore((state) =>
    !previewPattern && patternId ? (state.patterns.find((item) => item.id === patternId) ?? null) : null,
  );
  const pattern = previewPattern ?? storedPattern;
  const previewing = previewPattern != null;
  const allPatterns = useCrochetStore((state) => state.patterns);
  const projects = useCrochetStore((state) => state.projects);
  const yarnStash = useCrochetStore((state) => state.yarnStash);
  const account = useCrochetStore((state) => state.account);
  const allPatternComments = useCrochetStore((state) => state.patternComments);
  const storeComments = useMemo(() => {
    if (!patternId) return EMPTY_PATTERN_COMMENTS;
    return allPatternComments.filter((comment) => comment.patternId === patternId);
  }, [allPatternComments, patternId]);
  const createProject = useCrochetStore((state) => state.createProject);
  const addPatternFromYouTube = useCrochetStore((state) => state.addPatternFromYouTube);
  const toggleLikePattern = useCrochetStore((state) => state.toggleLikePattern);
  const toggleFollowCreator = useCrochetStore((state) => state.toggleFollowCreator);
  const addPatternComment = useCrochetStore((state) => state.addPatternComment);
  const collectedPatternIds = useCrochetStore((state) => state.collectedPatternIds);
  const liked = useCrochetStore((state) => (patternId ? selectIsPatternLiked(state, patternId) : false));
  const creatorName = pattern?.creator ?? '';
  const following = useCrochetStore((state) =>
    creatorName ? selectIsCreatorFollowed(state, creatorName) : false,
  );

  const previewId = previewPattern?.id ?? null;
  const [savedPreview, setSavedPreview] = useState<{ id: string; patternId: string } | null>(null);
  if (savedPreview && savedPreview.patternId !== previewId) {
    setSavedPreview(null);
  }
  const savedPreviewId = savedPreview && savedPreview.patternId === previewId ? savedPreview.id : null;
  const [activeTab, setActiveTab] = useState<DetailTab>('details');
  const [heroIndex, setHeroIndex] = useState(0);
  const [reviewsExpanded, setReviewsExpanded] = useState(false);
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const [draftComment, setDraftComment] = useState('');
  const [draftRating, setDraftRating] = useState(5);

  const meta = useMemo(() => (pattern ? getPatternExtendedMeta(pattern) : null), [pattern]);
  const hasLongerDescription = useMemo(
    () => (meta ? patternDescriptionAddsDetail(meta.summary, meta.description) : false),
    [meta],
  );
  const comments = useMemo(
    () => (pattern ? mergeComments(storeComments, meta?.communityReviews ?? []) : []),
    [pattern, storeComments, meta],
  );
  const userCommentCount = useMemo(
    () => storeComments.filter((comment) => !comment.id.startsWith('seed-comment-')).length,
    [storeComments],
  );
  const swatches = useMemo(
    () => (pattern ? collectSwatches(pattern, projects, yarnStash) : []),
    [pattern, projects, yarnStash],
  );
  const related = useMemo(
    () => (pattern ? getRelatedPatterns(pattern, allPatterns, 8) : []),
    [pattern, allPatterns],
  );

  const columnGap = Spacing.md;
  const columnWidth = Math.floor((windowWidth - Layout.screenGutter * 2 - columnGap) / 2);
  const masonry = useMemo(
    () => packMasonryColumns(related, columnWidth, undefined, columnGap),
    [related, columnWidth, columnGap],
  );

  const heroSlides = useMemo(() => {
    if (!pattern) return [];
    const poster = patternPosterUri(pattern.videoId, 'hq');
    const slides = [pattern.thumbnailUrl, poster ?? ''].filter((uri, index, list) => uri.length > 0 && list.indexOf(uri) === index);
    return slides;
  }, [pattern]);
  const showTutorial = Boolean(pattern?.videoId || pattern?.videoUrl);

  const tagPress = previewing ? undefined : onTagPress;
  const detailKey = previewPattern?.id ?? patternId ?? '';
  const [bottomBarHeight, setBottomBarHeight] = useState(0);
  const [seenDetailKey, setSeenDetailKey] = useState(detailKey);
  if (seenDetailKey !== detailKey) {
    setSeenDetailKey(detailKey);
    setActiveTab('details');
    setHeroIndex(0);
    setReviewsExpanded(false);
    setDraftComment('');
    setDraftRating(5);
  }

  useEffect(() => {
    sectionOffsets.current = {};
    if (!detailKey) return undefined;
    const frame = requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: false }));
    return () => cancelAnimationFrame(frame);
  }, [detailKey]);

  const scrollToSection = (tab: DetailTab) => {
    const y = sectionOffsets.current[tab];
    if (y == null) return;
    setActiveTab(tab);
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
  };

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = event.nativeEvent.contentOffset.y + 120;
    const entries = TABS.map((tab) => ({ tab: tab.id, y: sectionOffsets.current[tab.id] ?? 0 }))
      .filter((entry) => entry.y > 0)
      .sort((a, b) => a.y - b.y);
    let next: DetailTab = 'details';
    for (const entry of entries) {
      if (y >= entry.y) next = entry.tab;
    }
    if (next !== activeTab) setActiveTab(next);
  };

  const importPreview = (action: 'save' | 'start'): string | null => {
    if (!pattern) return null;
    const decision = catalogPreviewDecision(action);
    if (!decision.importPattern) return null;
    const existing =
      allPatterns.find((item) => pattern.videoId.length > 0 && item.videoId === pattern.videoId) ??
      allPatterns.find((item) => item.id === pattern.id);
    if (existing) return existing.id;
    return addPatternFromYouTube(patternToNewInput(pattern), pattern.id.length <= 80 ? pattern.id : undefined);
  };

  const onStart = () => {
    if (!pattern) return;
    if (previewing) {
      if (!catalogPreviewDecision('start').startProject) return;
      const id = importPreview('start');
      if (!id) return;
      const projectId = createProject({ name: pattern.title, patternId: id });
      if (!projectId) return;
      onPreviewStarted?.();
      openActiveProjectTab();
      return;
    }
    const id = createProject({ name: pattern.title, patternId: pattern.id });
    if (!id) return;
    onClose();
    openActiveProjectTab();
  };

  const onSavePreview = () => {
    const id = importPreview('save');
    if (!pattern || !id) return;
    setSavedPreview({ id, patternId: pattern.id });
  };

  const onLoadActive = () => {
    if (!pattern) return;
    const projectId = createProject({ name: pattern.title, patternId: pattern.id });
    if (!projectId) return;
    onClose();
    openActiveProjectTab();
  };

  const onShare = async () => {
    if (!pattern) return;
    tick();
    try {
      await Share.share({ message: `${pattern.title}\n${pattern.youtubeUrl}`, url: pattern.youtubeUrl });
    } catch {
      void Linking.openURL(pattern.youtubeUrl);
    }
  };

  const onPostComment = () => {
    if (!pattern || !draftComment.trim() || (previewing && !savedPreviewId)) return;
    const authorName = account?.displayName ?? 'Maker';
    const authorUsername = account?.username;
    const avatarColor = account?.avatarColor;
    addPatternComment({
      patternId: pattern.id,
      authorName,
      authorUsername,
      avatarColor,
      rating: draftRating,
      body: draftComment.trim(),
    });
    setDraftComment('');
    tick();
  };

  const visibleReviews = reviewsExpanded ? comments : comments.slice(0, 3);
  const avgRating =
    comments.length > 0 ? comments.reduce((sum, item) => sum + item.rating, 0) / comments.length : 0;

  return (
    <Modal
      visible={pattern !== null}
      animationType="slide"
      onRequestClose={() => { if (!dismissCrochetHelper(`pattern-${detailKey}`)) onClose(); }}
      onDismiss={onDismiss}
      statusBarTranslucent
      presentationStyle="fullScreen"
    >
      {pattern && meta ? (
        <KeyboardAvoidingView
          style={styles.screen}
          behavior={Platform.OS === 'web' ? undefined : 'padding'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
          testID="pattern-detail-sheet"
        >
          <View style={[styles.topBar, { paddingTop: insets.top + Spacing.xs }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              onPress={onClose}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed, webCursor]}
            >
              <ChevronLeftIcon color={Colors.textPrimary} />
            </Pressable>
            <View style={styles.topCreator}>
              <View style={[styles.avatar, { backgroundColor: creatorColor(pattern.creator) }]}>
                <Text style={styles.avatarText}>{creatorInitials(pattern.creator)}</Text>
              </View>
              <Text style={styles.topCreatorName} numberOfLines={1}>{pattern.creator}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: following }}
              accessibilityLabel={following ? 'Unfollow creator' : 'Follow creator'}
              onPress={() => {
                tick();
                toggleFollowCreator(pattern.creator);
              }}
              style={({ pressed }) => [
                styles.followPill,
                following && styles.followPillOn,
                pressed && styles.pressed,
                webCursor,
              ]}
            >
              <Text style={[styles.followText, following && styles.followTextOn]}>
                {following ? 'Following' : 'Follow'}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Share pattern"
              onPress={() => void onShare()}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed, webCursor]}
            >
              <ShareIcon color={Colors.textPrimary} />
            </Pressable>
          </View>

          <View style={styles.tabBar}>
            {TABS.map((tab) => {
              const on = activeTab === tab.id;
              return (
                <Pressable
                  key={tab.id}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  onPress={() => scrollToSection(tab.id)}
                  style={({ pressed }) => [styles.tab, pressed && styles.pressed, webCursor]}
                >
                  <Text style={[styles.tabLabel, on && styles.tabLabelOn]}>{tab.label}</Text>
                  {on ? <View style={styles.tabIndicator} /> : null}
                </Pressable>
              );
            })}
          </View>

          <ScrollView
            ref={scrollRef}
            onScroll={onScroll}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: Math.max(insets.bottom + 96, bottomBarHeight + 56) },
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            automaticallyAdjustKeyboardInsets
          >
            <View
              onLayout={(event) => {
                sectionOffsets.current.details = event.nativeEvent.layout.y;
              }}
            >
              <View style={styles.heroWrap}>
                {showTutorial ? (
                  <View style={[styles.heroVideo, { width: windowWidth }]}>
                    <PatternTutorialVideo videoId={pattern.videoId} videoUrl={pattern.videoUrl} />
                  </View>
                ) : (
                  <ScrollView
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    onMomentumScrollEnd={(event) => {
                      const index = Math.round(event.nativeEvent.contentOffset.x / windowWidth);
                      setHeroIndex(index);
                    }}
                  >
                    {heroSlides.map((uri) => (
                      <Image
                        key={uri}
                        accessible={false}
                        source={{ uri }}
                        style={[styles.heroImage, { width: windowWidth }]}
                      />
                    ))}
                  </ScrollView>
                )}
                {!showTutorial && heroSlides.length > 1 ? (
                  <View style={styles.heroBadge}>
                    <Text style={styles.heroBadgeText}>{heroIndex + 1}/{heroSlides.length}</Text>
                  </View>
                ) : null}
              </View>
              {!showTutorial && heroSlides.length > 1 ? (
                <View style={styles.dotsRow}>
                  {heroSlides.map((uri, index) => (
                    <View key={uri} style={[styles.dot, index === heroIndex && styles.dotOn]} />
                  ))}
                </View>
              ) : null}

              <Text role="heading" aria-level={2} style={styles.title}>{pattern.title}</Text>
              {previewing ? (
                <Text style={styles.previewNote}>Preview. Save or start when you want this pattern kept.</Text>
              ) : null}
              <View style={styles.statsRow}>
                <Text style={styles.stat}>{formatViewCount(pattern.id)} views</Text>
                <Text style={styles.statDot}>·</Text>
                <Text style={styles.stat}>{formatMakeCount(pattern.id)} makes</Text>
                <Text style={styles.statDot}>·</Text>
                <Text style={styles.stat}>{difficultyLabel(pattern.difficulty)}</Text>
              </View>

              <Text style={styles.summary}>{meta.summary}</Text>
              {hasLongerDescription ? (
                <View style={styles.aboutBlock}>
                  <Text style={styles.aboutHeading}>About this pattern</Text>
                  <Text style={styles.description}>{meta.description}</Text>
                </View>
              ) : null}

              <View style={styles.expandedBlock}>
                  {meta.keyStitches.length > 0 ? (
                    <View style={styles.keyStitches}>
                      <Text style={styles.sectionHeading}>Key stitches</Text>
                      <Text style={styles.bodyText}>{meta.keyStitches.join(' · ')}</Text>
                    </View>
                  ) : null}
                  <View style={styles.tutorialCard}>
                    {patternPosterUri(pattern.videoId, 'hq') ? (
                      <Image
                        accessible={false}
                        source={{ uri: patternPosterUri(pattern.videoId, 'hq') ?? '' }}
                        style={styles.tutorialThumb}
                      />
                    ) : null}
                    <View style={styles.tutorialCopy}>
                      <Text style={styles.tutorialTitle}>Tutorial preview</Text>
                      <Text style={styles.tutorialMeta} numberOfLines={2}>{pattern.title}</Text>
                    </View>
                  </View>
                  <View style={styles.clubCard}>
                    <Text style={styles.clubTitle}>{pattern.creator} Club</Text>
                    <Text style={styles.clubBody}>Get early drops, BOM packs, and maker-only chapters.</Text>
                  </View>
                  {pattern.tags.length > 0 ? (
                    <View style={styles.tagSection}>
                      <Text style={styles.tagSectionHeading}>Topics</Text>
                      <View style={styles.tagRow}>
                        {pattern.tags.map((tag) => (
                          <Pressable
                            key={tag}
                            accessibilityRole="button"
                            accessibilityLabel={`Browse patterns tagged ${tag}`}
                            disabled={!tagPress}
                            onPress={() => {
                              if (!tagPress) return;
                              tick();
                              tagPress(tag);
                            }}
                            style={({ pressed }) => [
                              styles.tagPill,
                              tagPress && styles.tagPillInteractive,
                              pressed && tagPress && styles.tagPillPressed,
                              webCursor,
                            ]}
                          >
                            <Text style={[styles.tagText, tagPress && styles.tagTextInteractive]}>
                              #{tag}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  ) : null}
                  {pattern.steps && pattern.steps.length > 0 ? (
                    <View style={styles.stepsBlock}>
                      <Text style={styles.sectionHeading}>Stitch steps</Text>
                      {pattern.steps.map((step, index) => (
                        <Text key={`${index}-${step}`} style={styles.bodyText}>{step}</Text>
                      ))}
                    </View>
                  ) : null}
                  {pattern.bookmarks.length > 0 ? (
                    <View style={styles.chapterWrap}>
                      {pattern.bookmarks.map((bookmark) => (
                        <View key={bookmark.id} style={styles.chapterChip}>
                          <Text style={styles.chapterTime}>{formatBookmarkTime(bookmark.seconds)}</Text>
                          <Text numberOfLines={1} style={styles.chapterLabel}>{bookmark.label}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                  <View style={styles.specsCard}>
                    <Spec label="Yarn size" value={yarnSizeLabel(pattern.yarnWeight)} />
                    <Spec label="Hook size" value={formatHookSize(pattern.hookSize)} />
                    <Spec label="Total rows" value={String(pattern.totalRows)} />
                    <Spec label="Stitches / row" value={String(pattern.stitchesPerRow)} />
                    <Spec label="Est. time" value={formatEstimated(meta.estimatedTimeMinutes)} />
                    <Spec label="Difficulty" value={difficultyLabel(pattern.difficulty)} />
                  </View>
                </View>
            </View>

            <View
              style={styles.section}
              onLayout={(event) => {
                sectionOffsets.current.bom = event.nativeEvent.layout.y;
              }}
            >
              <Text style={styles.sectionHeading}>Ready-to-Crochet Pack</Text>
              <View style={styles.packCard}>
                <Text style={styles.packBody}>
                  {formatSpecBadge(pattern)} · {meta.materials.length} materials · {meta.tools.length} tools
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Load in Active"
                  onPress={onLoadActive}
                  style={({ pressed }) => [styles.packCta, pressed && styles.pressed, webCursor]}
                >
                  <Text style={styles.packCtaText}>Load in Active</Text>
                </Pressable>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bomRow}>
                {meta.materials.map((material) => (
                  <View key={`${material.name}-${material.weight}`} style={styles.bomCard}>
                    <YarnSkeinIcon color={Colors.accentPrimary} />
                    <Text style={styles.bomTitle} numberOfLines={2}>{material.name}</Text>
                    <Text style={styles.bomMeta}>{material.weight}</Text>
                    <Text style={styles.bomMeta}>{material.yardage} yds</Text>
                  </View>
                ))}
                {meta.tools.map((tool) => (
                  <View key={`${tool.type}-${tool.size}`} style={styles.bomCard}>
                    <HookIcon color={Colors.textSecondary} />
                    <Text style={styles.bomTitle} numberOfLines={2}>{tool.type}</Text>
                    <Text style={styles.bomMeta}>{tool.size}</Text>
                  </View>
                ))}
              </ScrollView>
              {swatches.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.swatchRow}>
                  {swatches.map((swatch) => (
                    <View key={swatch.hex} style={styles.swatchItem}>
                      <View style={[styles.swatch, { backgroundColor: swatch.hex }]} />
                      <Text style={styles.swatchName} numberOfLines={2}>{swatch.name}</Text>
                    </View>
                  ))}
                </ScrollView>
              ) : null}
            </View>

            <View
              style={styles.section}
              onLayout={(event) => {
                sectionOffsets.current.reviews = event.nativeEvent.layout.y;
              }}
            >
              <Text style={styles.sectionHeading}>
                Ratings & Reviews ({formatCommentCount(pattern.id, userCommentCount)})
              </Text>
              <View style={styles.ratingBar}>
                <Text style={styles.ratingValue}>{avgRating.toFixed(1)}</Text>
                <View style={styles.ratingTrack}>
                  <View style={[styles.ratingFill, { width: `${(avgRating / 5) * 100}%` }]} />
                </View>
              </View>
              <View style={styles.composeBox}>
                <TextInput
                  value={draftComment}
                  onChangeText={setDraftComment}
                  placeholder="Add a comment..."
                  placeholderTextColor={Colors.textTertiary}
                  style={styles.composeInput}
                  multiline
                  onFocus={() => {
                    const y = sectionOffsets.current.reviews;
                    if (y != null) {
                      scrollRef.current?.scrollTo({ y: Math.max(0, y - Spacing.lg), animated: true });
                    }
                  }}
                />
                <View style={styles.composeActions}>
                  <StarPicker value={draftRating} onChange={setDraftRating} />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Post review"
                    onPress={onPostComment}
                    style={({ pressed }) => [styles.postButton, pressed && styles.pressed, webCursor]}
                  >
                    <Text style={styles.postButtonText}>Post</Text>
                  </Pressable>
                </View>
              </View>
              {visibleReviews.map((comment) => (
                <ReviewCard key={comment.id} comment={comment} />
              ))}
              {comments.length > 3 ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setReviewsExpanded((value) => !value)}
                  style={({ pressed }) => [styles.seeAll, pressed && styles.pressed, webCursor]}
                >
                  <Text style={styles.seeAllText}>
                    {reviewsExpanded ? 'Show fewer reviews' : 'See All Reviews'}
                  </Text>
                </Pressable>
              ) : null}
            </View>

            <View
              style={styles.section}
              onLayout={(event) => {
                sectionOffsets.current['for-you'] = event.nativeEvent.layout.y;
              }}
            >
              <Text style={styles.sectionHeading}>You May Also Like</Text>
              <View style={styles.masonry}>
                {masonry.map((column, columnIndex) => (
                  <View
                    key={`col-${columnIndex}`}
                    style={[styles.masonryColumn, columnIndex === 0 ? null : { marginLeft: columnGap }]}
                  >
                    {column.map(({ pattern: relatedPattern, imageHeight }) => (
                      <PatternFeedCard
                        key={relatedPattern.id}
                        pattern={relatedPattern}
                        imageHeight={imageHeight}
                        onPress={() => {
                          if (previewing) return;
                          onPatternChange?.(relatedPattern.id);
                          scrollRef.current?.scrollTo({ y: 0, animated: false });
                        }}
                      />
                    ))}
                  </View>
                ))}
              </View>
            </View>
          </ScrollView>

          <View
            style={[styles.bottomBar, { paddingBottom: insets.bottom + Spacing.sm }]}
            onLayout={(event) => setBottomBarHeight(event.nativeEvent.layout.height)}
          >
            {previewing ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={savedPreviewId ? 'Pattern saved' : 'Save pattern'}
                testID="pattern-preview-save"
                disabled={savedPreviewId != null}
                onPress={onSavePreview}
                style={({ pressed }) => [styles.previewSave, pressed && styles.pressed, webCursor]}
              >
                <Text style={styles.previewSaveText}>{savedPreviewId ? 'Saved' : 'Save pattern'}</Text>
              </Pressable>
            ) : (
              <>
                <IconCountButton
                  label="Like"
                  count={formatLikeCount(pattern.id, liked)}
                  onPress={() => {
                    tick();
                    toggleLikePattern(pattern.id);
                  }}
                  icon={<HeartIcon color={liked ? Colors.accentPrimary : Colors.textSecondary} filled={liked} size={20} />}
                  active={liked}
                />
                <IconCountButton
                  label="Collect"
                  count={formatCollectCount(pattern.id)}
                  onPress={() => {
                    tick();
                    if (!pattern) return;
                    handlePatternCollectPress(pattern.id, () => setFolderPickerOpen(true));
                  }}
                  icon={<FolderIcon color={collectedPatternIds.includes(pattern.id) ? Colors.accentPrimary : Colors.textSecondary} />}
                  active={collectedPatternIds.includes(pattern.id)}
                />
                <IconCountButton
                  label="Comment"
                  count={formatCommentCount(pattern.id, userCommentCount)}
                  onPress={() => scrollToSection('reviews')}
                  icon={<CommentIcon color={Colors.textSecondary} />}
                />
              </>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={previewing ? 'Save and start' : 'Prepare to Crochet'}
              testID="pattern-detail-start"
              onPress={onStart}
              style={({ pressed }) => [styles.primaryCta, pressed && styles.pressed, webCursor]}
            >
              <Text style={styles.primaryCtaText}>{previewing ? 'Save and start' : 'Prepare to Crochet'}</Text>
            </Pressable>
          </View>

          <CrochetHelperHost
            surface={`pattern-${detailKey}`}
            pattern={pattern}
            inline
            launcherBottomInset={bottomBarHeight}
            renderPreview={(nextPattern, onPreviewClose) => (
              <PatternDetailSheet patternId={null} previewPattern={nextPattern} onClose={onPreviewClose} />
            )}
          />
          <SaveToFolderSheet
            visible={folderPickerOpen}
            patternId={pattern.id}
            onClose={() => setFolderPickerOpen(false)}
          />
        </KeyboardAvoidingView>
      ) : null}
    </Modal>
  );
}

function mergeComments(store: PatternComment[], seed: PatternComment[]): PatternComment[] {
  const map = new Map<string, PatternComment>();
  for (const comment of seed) map.set(comment.id, comment);
  for (const comment of store) map.set(comment.id, comment);
  return [...map.values()].sort(
    (a, b) =>
      Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.createdAt - a.createdAt || a.id.localeCompare(b.id),
  );
}

function formatEstimated(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours <= 0) return `${mins} min`;
  if (mins === 0) return `${hours} h`;
  return `${hours} h ${mins} min`;
}

function ReviewCard({ comment }: { comment: PatternComment }) {
  return (
    <View style={styles.reviewCard}>
      <View style={styles.reviewHeader}>
        <View style={[styles.avatar, { backgroundColor: comment.avatarColor }]}>
          <Text style={styles.avatarText}>{comment.authorName.slice(0, 2).toUpperCase()}</Text>
        </View>
        <View style={styles.reviewMeta}>
          <Text style={styles.reviewAuthor}>{comment.authorName}</Text>
          <Text style={styles.reviewUsername}>@{comment.authorUsername}</Text>
        </View>
        <Text style={styles.reviewStars}>{'★'.repeat(comment.rating)}</Text>
      </View>
      {comment.pinned ? (
        <View style={styles.pinnedBadge}>
          <Text style={styles.pinnedText}>Pinned by Designer</Text>
        </View>
      ) : null}
      <Text style={styles.reviewBody}>{comment.body}</Text>
      {comment.photoUri ? (
        <Image accessible={false} source={{ uri: comment.photoUri }} style={styles.reviewPhoto} />
      ) : null}
    </View>
  );
}

function StarPicker({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <View style={styles.starRow}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Pressable
          key={star}
          accessibilityRole="button"
          accessibilityLabel={`${star} star rating`}
          onPress={() => onChange(star)}
          style={({ pressed }) => [pressed && styles.pressed, webCursor]}
        >
          <Text style={[styles.starGlyph, star <= value && styles.starGlyphOn]}>★</Text>
        </Pressable>
      ))}
    </View>
  );
}

function IconCountButton({
  label,
  count,
  onPress,
  icon,
  active,
}: {
  label: string;
  count: string;
  onPress: () => void;
  icon: ReactNode;
  active?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.bottomIconButton, pressed && styles.pressed, webCursor]}
    >
      {icon}
      <Text style={[styles.bottomIconCount, active && styles.bottomIconCountOn]}>{count}</Text>
    </Pressable>
  );
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
    for (const color of project.yarnColors) push(color.hexColor, color.label);
  }
  for (const item of stash) {
    if (item.yarnWeight !== pattern.yarnWeight) continue;
    push(item.hexColor, item.colorName);
  }
  return swatches;
}

function FolderIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 8.5 A2 2 0 0 1 6 6.5 H10 L12 9 H18 A2 2 0 0 1 20 11 V18.5 A2 2 0 0 1 18 20.5 H6 A2 2 0 0 1 4 18.5 V8.5 Z"
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function CommentIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 5.5 A2.5 2.5 0 0 1 6.5 3 H17.5 A2.5 2.5 0 0 1 20 5.5 V14.5 A2.5 2.5 0 0 1 17.5 17 H10 L6 20.5 V17 H6.5 A2.5 2.5 0 0 1 4 14.5 V5.5 Z"
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function ChevronLeftIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M14.5 6 L8.5 12 L14.5 18" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function ShareIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 4 L12 14 M12 4 L8 8 M12 4 L16 8 M6 14 L6 18 A2 2 0 0 0 8 20 L16 20 A2 2 0 0 0 18 18 L18 14"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function YarnSkeinIcon({ color }: { color: string }) {
  return (
    <Svg width={36} height={36} viewBox="0 0 36 36" fill="none">
      <Circle cx={18} cy={18} r={12} stroke={color} strokeWidth={1.6} />
      <Path d="M10 14 C14 10 22 10 26 14 M10 22 C14 26 22 26 26 22" stroke={color} strokeWidth={1.4} />
    </Svg>
  );
}

function HookIcon({ color }: { color: string }) {
  return (
    <Svg width={36} height={36} viewBox="0 0 36 36" fill="none">
      <Path
        d="M10 8 C10 8 10 20 18 20 C24 20 26 16 26 12 C26 8 22 6 18 8"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      <Rect x={8} y={22} width={6} height={8} rx={2} fill={color} opacity={0.35} />
    </Svg>
  );
}

function tick() {
  if (Platform.OS === 'web') return;
  void Haptics.selectionAsync();
}

const webCursor = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : null;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.backgroundPrimary },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Layout.screenGutter,
    paddingBottom: Spacing.sm,
    backgroundColor: Colors.backgroundPrimary,
    borderBottomWidth: Layout.hairline,
    borderBottomColor: Colors.border,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.elevatedControl,
  },
  topCreator: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minWidth: 0 },
  topCreatorName: { ...Typography.callout, color: Colors.textPrimary, flex: 1 },
  followPill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.elevatedControl,
  },
  followPillOn: { backgroundColor: Colors.accentMuted, borderColor: Colors.accentPrimary },
  followText: { ...Typography.caption, color: Colors.textPrimary, fontWeight: FontWeight.semibold },
  followTextOn: { color: Colors.accentPrimary },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.backgroundPrimary,
    borderBottomWidth: Layout.hairline,
    borderBottomColor: Colors.border,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: Spacing.sm },
  tabLabel: { ...Typography.caption, color: Colors.textSecondary, fontWeight: FontWeight.medium },
  tabLabelOn: { color: Colors.textPrimary, fontWeight: FontWeight.bold },
  tabIndicator: {
    marginTop: Spacing.xs,
    width: 28,
    height: 3,
    borderRadius: Radius.pill,
    backgroundColor: Colors.accentPrimary,
  },
  scrollContent: { gap: Spacing.lg },
  heroWrap: { position: 'relative' },
  heroVideo: { aspectRatio: 16 / 9, backgroundColor: Colors.backgroundPrimary, overflow: 'hidden' },
  heroImage: { aspectRatio: 16 / 9, backgroundColor: Colors.elevatedControl },
  heroBadge: {
    position: 'absolute',
    top: Spacing.sm,
    right: Layout.screenGutter,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xxs,
    borderRadius: Radius.pill,
    backgroundColor: Colors.scrim,
  },
  heroBadgeText: { ...Typography.caption, color: Colors.textPrimary, fontWeight: FontWeight.bold },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  dot: { width: 6, height: 6, borderRadius: Radius.pill, backgroundColor: Colors.textTertiary },
  dotOn: { backgroundColor: Colors.accentPrimary, width: 16 },
  title: {
    ...Typography.headline,
    color: Colors.textPrimary,
    paddingHorizontal: Layout.screenGutter,
    marginTop: Spacing.md,
  },
  previewNote: {
    ...Typography.caption,
    color: Colors.textSecondary,
    paddingHorizontal: Layout.screenGutter,
    marginTop: Spacing.xs,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Layout.screenGutter,
    marginTop: Spacing.xs,
  },
  stat: { ...Typography.caption, color: Colors.textSecondary },
  statDot: { ...Typography.caption, color: Colors.textTertiary },
  summary: {
    ...Typography.body,
    color: Colors.textPrimary,
    paddingHorizontal: Layout.screenGutter,
    marginTop: Spacing.sm,
  },
  aboutBlock: {
    gap: Spacing.xs,
    paddingHorizontal: Layout.screenGutter,
    marginTop: Spacing.md,
  },
  aboutHeading: { ...Typography.label, color: Colors.textSecondary },
  description: {
    ...Typography.callout,
    color: Colors.textPrimary,
  },
  expandedBlock: { gap: Spacing.md, paddingHorizontal: Layout.screenGutter, marginTop: Spacing.md },
  keyStitches: { gap: Spacing.xs },
  sectionHeading: {
    ...Typography.label,
    color: Colors.textPrimary,
    paddingHorizontal: Layout.screenGutter,
    marginBottom: Spacing.sm,
  },
  bodyText: { ...Typography.callout, color: Colors.textSecondary },
  tutorialCard: {
    flexDirection: 'row',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.cardSurface,
  },
  tutorialThumb: { width: 96, height: 54, borderRadius: Radius.sm, backgroundColor: Colors.elevatedControl },
  tutorialCopy: { flex: 1, justifyContent: 'center', gap: Spacing.xxs },
  tutorialTitle: { ...Typography.label, color: Colors.textPrimary },
  tutorialMeta: { ...Typography.caption, color: Colors.textSecondary },
  clubCard: {
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.elevatedControl,
    gap: Spacing.xs,
  },
  clubTitle: { ...Typography.label, color: Colors.textPrimary },
  clubBody: { ...Typography.caption, color: Colors.textSecondary },
  tagSection: { gap: Spacing.sm },
  tagSectionHeading: {
    ...Typography.label,
    color: Colors.textSecondary,
    paddingHorizontal: 0,
    marginBottom: 0,
  },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  tagPill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xxs,
    borderRadius: Radius.pill,
    backgroundColor: Colors.elevatedControl,
  },
  tagPillInteractive: {
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tagPillPressed: {
    backgroundColor: Colors.accentMuted,
    borderColor: Colors.accentPrimary,
  },
  tagText: { ...Typography.caption, color: Colors.textPrimary },
  tagTextInteractive: { color: Colors.accentPrimary, fontWeight: FontWeight.semibold },
  stepsBlock: { gap: Spacing.xs },
  chapterWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chapterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
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
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xxs,
  },
  chapterLabel: { ...Typography.caption, color: Colors.textPrimary, maxWidth: 180 },
  specsCard: {
    borderRadius: Radius.md,
    backgroundColor: Colors.cardSurface,
    overflow: 'hidden',
  },
  specRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: Layout.hairline,
    borderBottomColor: Colors.border,
  },
  specLabel: { ...Typography.callout, color: Colors.textSecondary },
  specValue: { ...Typography.callout, color: Colors.textPrimary, fontWeight: FontWeight.semibold },
  section: { gap: Spacing.sm },
  packCard: {
    marginHorizontal: Layout.screenGutter,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.cardSurface,
    gap: Spacing.md,
  },
  packBody: { ...Typography.callout, color: Colors.textSecondary },
  packCta: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.pill,
    backgroundColor: Colors.accentMuted,
    borderWidth: 1,
    borderColor: Colors.accentPrimary,
  },
  packCtaText: { ...Typography.caption, color: Colors.accentPrimary, fontWeight: FontWeight.bold },
  bomRow: { gap: Spacing.md, paddingHorizontal: Layout.screenGutter },
  bomCard: {
    width: 132,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.elevatedControl,
    gap: Spacing.xs,
    alignItems: 'flex-start',
  },
  bomTitle: { ...Typography.label, color: Colors.textPrimary },
  bomMeta: { ...Typography.caption, color: Colors.textSecondary },
  swatchRow: { gap: Spacing.md, paddingHorizontal: Layout.screenGutter },
  swatchItem: { width: 72, alignItems: 'center', gap: Spacing.xs },
  swatch: {
    width: 28,
    height: 28,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  swatchName: { ...Typography.caption, color: Colors.textPrimary, textAlign: 'center' },
  ratingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Layout.screenGutter,
  },
  ratingValue: { ...Typography.headline, color: Colors.textPrimary },
  ratingTrack: {
    flex: 1,
    height: 8,
    borderRadius: Radius.pill,
    backgroundColor: Colors.elevatedControl,
    overflow: 'hidden',
  },
  ratingFill: { height: '100%', backgroundColor: Colors.accentPrimary },
  composeBox: {
    marginHorizontal: Layout.screenGutter,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.cardSurface,
    gap: Spacing.sm,
  },
  composeInput: {
    ...Typography.body,
    minHeight: 72,
    color: Colors.textPrimary,
  },
  composeActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  starRow: { flexDirection: 'row', gap: Spacing.xs },
  starGlyph: { fontSize: 22, color: Colors.textTertiary },
  starGlyphOn: { color: Colors.warning },
  postButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.pill,
    backgroundColor: Colors.accentPrimary,
  },
  postButtonText: { ...Typography.caption, color: Colors.onAccent, fontWeight: FontWeight.bold },
  reviewCard: {
    marginHorizontal: Layout.screenGutter,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.cardSurface,
    gap: Spacing.sm,
  },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  reviewMeta: { flex: 1 },
  reviewAuthor: { ...Typography.label, color: Colors.textPrimary },
  reviewUsername: { ...Typography.caption, color: Colors.textSecondary },
  reviewStars: { ...Typography.caption, color: Colors.warning },
  pinnedBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xxs,
    borderRadius: Radius.pill,
    backgroundColor: Colors.accentMuted,
  },
  pinnedText: { ...Typography.caption, color: Colors.accentPrimary, fontWeight: FontWeight.bold },
  reviewBody: { ...Typography.callout, color: Colors.textPrimary },
  reviewPhoto: { width: '100%', height: 160, borderRadius: Radius.md, backgroundColor: Colors.elevatedControl },
  seeAll: { alignSelf: 'center', paddingVertical: Spacing.sm },
  seeAllText: { ...Typography.label, color: Colors.accentPrimary },
  masonry: {
    flexDirection: 'row',
    paddingHorizontal: Layout.screenGutter,
  },
  masonryColumn: { flex: 1 },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...Typography.caption, color: Colors.textPrimary, fontWeight: FontWeight.bold },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Layout.screenGutter,
    paddingTop: Spacing.sm,
    backgroundColor: Colors.cardSurface,
    borderTopWidth: Layout.hairline,
    borderTopColor: Colors.border,
  },
  bottomIconButton: { alignItems: 'center', justifyContent: 'center', minWidth: 44, gap: 2 },
  bottomIconCount: { ...Typography.caption, color: Colors.textSecondary, fontSize: 11 },
  bottomIconCountOn: { color: Colors.accentPrimary },
  previewSave: {
    minHeight: 48,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.elevatedControl,
  },
  previewSaveText: {
    ...Typography.label,
    color: Colors.accentPrimary,
  },
  primaryCta: {
    flex: 1,
    minHeight: 48,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accentPrimary,
  },
  primaryCtaText: { ...Typography.label, color: Colors.onAccent, fontWeight: FontWeight.bold },
  pressed: { opacity: 0.72 },
});
