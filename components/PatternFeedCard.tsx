/**
 * Masonry feed card shared by Patterns and Me library grids.
 */
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useState } from 'react';
import Svg, { Path } from 'react-native-svg';

import { HeartIcon } from '@/components/HeartIcon';
import { SaveToFolderSheet } from '@/components/SaveToFolderSheet';
import { Colors, FontFamily, FontWeight, Layout, Radius, Spacing, Typography } from '@/constants/BambuTheme';
import { selectIsPatternCollected, selectIsPatternLiked, useCrochetStore, type CrochetPattern } from '@/store/useCrochetStore';
import { handlePatternCollectPress } from '@/utils/instantCollect';
import {
  creatorColor,
  creatorInitials,
  formatLikeCount,
  formatSpecBadge,
} from '@/utils/patternDisplay';
import { patternPosterUri } from '@/utils/youtube';

type PatternFeedCardProps = {
  pattern: CrochetPattern;
  imageHeight: number;
  onPress: () => void;
  /** When true, the like chip always shows the liked styling (Likes tab). */
  forceLikedVisual?: boolean;
};

export function PatternFeedCard({ pattern, imageHeight, onPress, forceLikedVisual }: PatternFeedCardProps) {
  const liked = useCrochetStore((state) => selectIsPatternLiked(state, pattern.id));
  const collected = useCrochetStore((state) => selectIsPatternCollected(state, pattern.id));
  const toggleLikePattern = useCrochetStore((state) => state.toggleLikePattern);
  const showLiked = forceLikedVisual || liked;
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);

  return (
    <View style={styles.card} testID={`pattern-card-${pattern.id}`}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${pattern.title}, ${formatSpecBadge(pattern)}, by ${pattern.creator}`}
        onPress={onPress}
        style={({ pressed }) => [pressed && styles.pressed, webCursor]}
      >
        <View style={[styles.cardImageWrap, { height: imageHeight }]}>
          {patternPosterUri(pattern.videoId, 'hq') ? (
            <Image
              accessible={false}
              source={{ uri: patternPosterUri(pattern.videoId, 'hq') ?? '' }}
              style={styles.cardImage}
              contentFit="cover"
              cachePolicy="memory-disk"
              recyclingKey={pattern.id}
              transition={150}
            />
          ) : (
            <View style={styles.cardImage} />
          )}
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{formatSpecBadge(pattern)}</Text>
          </View>
        </View>
        <Text numberOfLines={2} style={styles.cardTitle}>
          {pattern.title}
        </Text>
      </Pressable>
      <View style={styles.cardFooter}>
        <View style={[styles.avatar, { backgroundColor: creatorColor(pattern.creator) }]}>
          <Text style={styles.avatarText}>{creatorInitials(pattern.creator)}</Text>
        </View>
        <Text numberOfLines={1} style={styles.creator}>
          {pattern.creator}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={collected ? 'Change collection' : 'Collect pattern'}
          hitSlop={Layout.hitSlop}
          onPress={() => {
            tick();
            handlePatternCollectPress(pattern.id, () => setFolderPickerOpen(true));
          }}
          style={({ pressed }) => [styles.collect, pressed && styles.pressed, webCursor]}
        >
          <BookmarkIcon color={collected ? Colors.accentPrimary : Colors.textSecondary} filled={collected} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={showLiked ? 'Unlike pattern' : 'Like pattern'}
          accessibilityState={{ selected: showLiked }}
          hitSlop={Layout.hitSlop}
          onPress={() => {
            tick();
            toggleLikePattern(pattern.id);
          }}
          style={({ pressed }) => [styles.likes, pressed && styles.pressed, webCursor]}
        >
          <HeartIcon color={showLiked ? Colors.accentPrimary : Colors.textSecondary} filled={showLiked} />
          <Text style={[styles.likeCount, showLiked && styles.likeCountOn]}>
            {formatLikeCount(pattern.id, showLiked)}
          </Text>
        </Pressable>
      </View>
      <SaveToFolderSheet
        visible={folderPickerOpen}
        patternId={pattern.id}
        onClose={() => setFolderPickerOpen(false)}
      />
    </View>
  );
}

function BookmarkIcon({ color, filled }: { color: string; filled: boolean }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6 4.5 A2 2 0 0 1 8 2.5 H16 A2 2 0 0 1 18 4.5 V19.5 L12 16 L6 19.5 V4.5 Z"
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
        fill={filled ? color : 'none'}
      />
    </Svg>
  );
}

function tick() {
  if (Platform.OS === 'web') return;
  void Haptics.selectionAsync();
}

const webCursor = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : null;

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.cardSurface,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  cardImageWrap: {
    backgroundColor: Colors.elevatedControl,
  },
  cardImage: {
    width: '100%',
    height: '100%',
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
    fontFamily: FontFamily.medium,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: FontWeight.bold,
    color: Colors.onAccent,
  },
  cardTitle: {
    fontFamily: FontFamily.medium,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    minHeight: 36,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm + 2,
  },
  avatar: {
    width: 18,
    height: 18,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: Colors.textPrimary,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: FontWeight.bold,
  },
  creator: {
    ...Typography.caption,
    flex: 1,
    color: Colors.textSecondary,
  },
  collect: {
    padding: 2,
  },
  likes: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  likeCount: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  likeCountOn: {
    color: Colors.accentPrimary,
    fontWeight: FontWeight.semibold,
  },
  pressed: {
    opacity: 0.72,
  },
});
