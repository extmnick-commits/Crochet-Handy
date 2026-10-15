/**
 * Slow-scrolling, softly blurred pattern mosaic behind the welcome / sign-in screen.
 */
import { BlurView } from 'expo-blur';
import { useEffect, useMemo, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
  type ImageStyle,
  type LayoutChangeEvent,
  type ViewStyle,
} from 'react-native';

import { Colors, Layout, Radius, Spacing } from '@/constants/BambuTheme';
import { useCrochetStore, type CrochetPattern } from '@/store/useCrochetStore';
import { youtubeThumbnailUrl } from '@/utils/youtube';

const MOBILE_TILE_COUNT = 27;
const MOBILE_COLUMNS = 3;
const GRID_MAX_WIDTH = 440;
/** Match native app backdrop on phones and narrow mobile web viewports. */
const NARROW_BACKDROP_MAX_WIDTH = 520;
/** Milliseconds of scroll per pixel — lower is faster. */
const MS_PER_PIXEL = 28;
/** Teaser blur — visible on native via Image blurRadius + BlurView (not only web CSS). */
const WEB_IMAGE_FILTER = 'blur(4px) saturate(1.12)';
const BLUR_INTENSITY = Platform.select({ ios: 40, android: 72, web: 28, default: 35 }) ?? 35;
const NATIVE_IMAGE_BLUR = Platform.select({ ios: 12, android: 6, default: 0 }) ?? 0;
const SCRIM_OPACITY = Platform.select({ ios: 0.26, android: 0.24, web: 0.3, default: 0.28 }) ?? 0.28;

type BackdropLayout = {
  columns: number;
  gap: number;
  gridWidth: number;
  tileWidth: number;
  tileCount: number;
  coverScale: number;
  fullBleed: boolean;
};

function resolveBackdropLayout(windowWidth: number, windowHeight: number): BackdropLayout {
  const useDesktopWebBackdrop = Platform.OS === 'web' && windowWidth > NARROW_BACKDROP_MAX_WIDTH;

  if (useDesktopWebBackdrop) {
    const columns = Math.max(4, Math.min(7, Math.round(windowWidth / 128)));
    const gap = 0;
    const gridWidth = windowWidth;
    const tileWidth = gridWidth / columns;
    const rowsPerStrip = 14;
    const rowHeight = tileWidth / 0.58;
    const coverScale = Math.max(windowHeight / (2.2 * rowHeight), 1.28);
    return {
      columns,
      gap,
      gridWidth,
      tileWidth,
      tileCount: columns * rowsPerStrip,
      coverScale,
      fullBleed: true,
    };
  }

  const columns = MOBILE_COLUMNS;
  const gap = Spacing.sm;
  const gridWidth = Math.min(windowWidth - Layout.screenGutter * 2, GRID_MAX_WIDTH);
  const tileWidth = (gridWidth - gap * (columns - 1)) / columns;
  return {
    columns,
    gap,
    gridWidth,
    tileWidth,
    tileCount: MOBILE_TILE_COUNT,
    coverScale: Platform.OS === 'web' ? 1.1 : 1.06,
    fullBleed: false,
  };
}

export function WelcomePatternBackdrop() {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const layout = useMemo(
    () => resolveBackdropLayout(windowWidth, windowHeight),
    [windowWidth, windowHeight],
  );
  const patterns = useCrochetStore((state) => state.patterns);
  const tiles = useMemo(() => pickBackdropPatterns(patterns, layout.tileCount), [patterns, layout.tileCount]);
  const [stripHeight, setStripHeight] = useState(0);
  const [scrollY] = useState(() => new Animated.Value(0));

  const { columns, gap, gridWidth, tileWidth, coverScale, fullBleed } = layout;
  const webCellStyle = fullBleed ? styles.cellWeb : null;

  useEffect(() => {
    if (stripHeight <= 0) return undefined;

    scrollY.setValue(0);
    const duration = Math.max(stripHeight * MS_PER_PIXEL, 18_000);
    // Native blur overlays often miss content inside a native-driven transform layer.
    const useNativeDriver = Platform.OS === 'web';
    const loop = Animated.loop(
      Animated.timing(scrollY, {
        toValue: -stripHeight,
        duration,
        easing: Easing.linear,
        useNativeDriver,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [scrollY, stripHeight]);

  const onStripLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.height);
    if (next > 0 && next !== stripHeight) {
      setStripHeight(next);
    }
  };

  if (tiles.length === 0) {
    return <View style={styles.fallback} pointerEvents="none" />;
  }

  return (
    <View
      style={styles.root}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={fullBleed ? styles.viewportWeb : styles.viewportNative}>
        <Animated.View
          style={[
            fullBleed ? styles.scrollTrackWeb : styles.scrollTrackNative,
            {
              width: gridWidth,
              transform: [{ translateY: scrollY }, { scale: coverScale }],
            },
            fullBleed && Platform.OS === 'web'
              ? ({ transformOrigin: '50% 0%' } as ViewStyle)
              : null,
          ]}
        >
          <PatternStrip
            tiles={tiles}
            columns={columns}
            tileWidth={tileWidth}
            gap={gap}
            cellStyle={webCellStyle}
            onLayout={onStripLayout}
          />
          <PatternStrip
            tiles={tiles}
            columns={columns}
            tileWidth={tileWidth}
            gap={gap}
            cellStyle={webCellStyle}
          />
        </Animated.View>
      </View>

      <BlurView
        intensity={BLUR_INTENSITY}
        tint="dark"
        style={StyleSheet.absoluteFill}
        blurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
      />

      <View style={styles.scrim} />
      <View style={styles.vignette} />
    </View>
  );
}

function PatternStrip({
  tiles,
  columns,
  tileWidth,
  gap,
  cellStyle,
  onLayout,
}: {
  tiles: CrochetPattern[];
  columns: number;
  tileWidth: number;
  gap: number;
  cellStyle?: ViewStyle | null;
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  const stripWidth = tileWidth * columns + gap * Math.max(columns - 1, 0);
  const webThumbBlur =
    Platform.OS === 'web' ? ({ filter: WEB_IMAGE_FILTER } as ImageStyle) : null;

  return (
    <View style={[styles.strip, { width: stripWidth, gap }]} onLayout={onLayout}>
      {tiles.map((pattern, index) => (
        <View key={`${pattern.id}-${index}`} style={[styles.cell, cellStyle, { width: tileWidth }]}>
          <Image
            accessible={false}
            source={{ uri: youtubeThumbnailUrl(pattern.videoId, 'hq') }}
            style={[
              styles.thumb,
              cellStyle ? styles.thumbWeb : null,
              webThumbBlur,
            ]}
            blurRadius={NATIVE_IMAGE_BLUR}
          />
        </View>
      ))}
    </View>
  );
}

function pickBackdropPatterns(patterns: CrochetPattern[], count: number): CrochetPattern[] {
  const withVideo = patterns.filter((item) => item.videoId);
  if (withVideo.length === 0) return [];

  const picked: CrochetPattern[] = [];
  const step = Math.max(1, Math.floor(withVideo.length / count));
  for (let i = 0; i < count; i += 1) {
    const pattern = withVideo[(i * step) % withVideo.length];
    if (!picked.some((item) => item.id === pattern.id)) {
      picked.push(pattern);
    }
  }

  let cursor = 0;
  while (picked.length < count && cursor < withVideo.length) {
    const pattern = withVideo[cursor];
    if (!picked.some((item) => item.id === pattern.id)) {
      picked.push(pattern);
    }
    cursor += 1;
  }

  return picked;
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
    backgroundColor: Colors.backgroundPrimary,
  },
  fallback: {
    ...StyleSheet.absoluteFill,
    backgroundColor: Colors.backgroundPrimary,
  },
  viewportNative: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    overflow: 'hidden',
  },
  viewportWeb: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  scrollTrackNative: {
    position: 'absolute',
    top: -Spacing.huge,
    alignSelf: 'center',
  },
  scrollTrackWeb: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignSelf: 'stretch',
  },
  strip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    aspectRatio: 0.62,
    overflow: 'hidden',
  },
  cellWeb: {
    aspectRatio: 0.58,
  },
  thumbWeb: {
    borderRadius: 0,
  },
  thumb: {
    width: '100%',
    height: '100%',
    borderRadius: Radius.lg,
    backgroundColor: Colors.elevatedControl,
  },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: `rgba(18, 18, 18, ${SCRIM_OPACITY})`,
  },
  vignette: {
    ...StyleSheet.absoluteFill,
    backgroundColor: Colors.transparent,
    ...Platform.select({
      web: {
        boxShadow: 'inset 0 0 72px 32px rgba(18, 18, 18, 0.38)',
      },
      default: {},
    }),
  },
});
