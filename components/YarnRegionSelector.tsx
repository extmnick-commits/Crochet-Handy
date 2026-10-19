/**
 * Tap and drag the yarn in a leftover photo.
 * The overlay is the contain-fit image, so handles sit on the yarn rather than the letterbox.
 */
import { useEffect, useRef, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Radius, Spacing, Typography } from '@/constants/BambuTheme';
import {
  frameDeltaToImageNorm,
  framePointToImageNorm,
  hitTestRegionFrame,
  imageNormRectToFrame,
  moveRegion,
  regionAroundNormPoint,
  regionAtNormPoint,
  resizeRegion,
  type ResizeHandle,
  type YarnSampleRegion,
} from '@/utils/yarnRegion';

const MAX_REGIONS = 4;

type YarnRegionSelectorProps = {
  imageUri: string;
  imageWidth: number;
  imageHeight: number;
  regions: readonly YarnSampleRegion[];
  onImageSize: (width: number, height: number) => void;
  onRegionsCommit: (regions: YarnSampleRegion[]) => void;
  onCreateId: () => string;
};

type Drag =
  | {
      mode: 'move' | ResizeHandle;
      id: string;
      lastX: number;
      lastY: number;
      moved: boolean;
    }
  | { mode: 'pending'; lastX: number; lastY: number; moved: boolean };

export function YarnRegionSelector({
  imageUri,
  imageWidth,
  imageHeight,
  regions,
  onImageSize,
  onRegionsCommit,
  onCreateId,
}: YarnRegionSelectorProps) {
  const [frame, setFrame] = useState({ width: 0, height: 0 });
  const [live, setLive] = useState<YarnSampleRegion[]>(() => regions.map((region) => ({ ...region })));
  const [selectedId, setSelectedId] = useState<string | null>(regions[regions.length - 1]?.id ?? null);
  const drag = useRef<Drag | null>(null);
  const liveRef = useRef(live);

  useEffect(() => {
    if (drag.current) return;
    const next = regions.map((region) => ({ ...region }));
    liveRef.current = next;
    setLive(next);
    setSelectedId((current) => (current && next.some((region) => region.id === current) ? current : (next[next.length - 1]?.id ?? null)));
  }, [regions]);

  const ready = imageWidth > 0 && imageHeight > 0 && frame.width > 0 && frame.height > 0;
  const aspect = imageWidth > 0 && imageHeight > 0 ? imageWidth / imageHeight : 4 / 5;

  const commit = (next: YarnSampleRegion[]) => {
    setLive(next);
    onRegionsCommit(next);
  };

  const onGrant = (x: number, y: number) => {
    if (!ready) return;
    const selected = liveRef.current.find((region) => region.id === selectedId) ?? null;
    if (selected) {
      const box = imageNormRectToFrame(selected, frame.width, frame.height, imageWidth, imageHeight);
      const hit = hitTestRegionFrame(x, y, box);
      if (hit) {
        drag.current = { mode: hit, id: selected.id, lastX: x, lastY: y, moved: false };
        return;
      }
    }
    const hitRegion = (() => {
      const norm = framePointToImageNorm(x, y, frame.width, frame.height, imageWidth, imageHeight);
      return norm ? regionAtNormPoint(liveRef.current, norm.x, norm.y) : null;
    })();
    if (hitRegion) {
      setSelectedId(hitRegion.id);
      drag.current = { mode: 'move', id: hitRegion.id, lastX: x, lastY: y, moved: false };
      return;
    }
    drag.current = { mode: 'pending', lastX: x, lastY: y, moved: false };
  };

  const onMove = (x: number, y: number) => {
    const current = drag.current;
    if (!current || !ready) return;
    const delta = frameDeltaToImageNorm(x - current.lastX, y - current.lastY, frame.width, frame.height, imageWidth, imageHeight);
    if (Math.abs(x - current.lastX) + Math.abs(y - current.lastY) > 2) current.moved = true;
    current.lastX = x;
    current.lastY = y;
    if (current.mode === 'pending') return;
    setLive((items) => {
      const next = items.map((region) => {
        if (region.id !== current.id) return region;
        return current.mode === 'move' ? moveRegion(region, delta.x, delta.y) : resizeRegion(region, current.mode, delta.x, delta.y);
      });
      liveRef.current = next;
      return next;
    });
  };

  const onRelease = (x: number, y: number) => {
    const current = drag.current;
    drag.current = null;
    if (!current || !ready) return;
    if (current.mode === 'pending' && !current.moved) {
      const norm = framePointToImageNorm(x, y, frame.width, frame.height, imageWidth, imageHeight);
      if (!norm || liveRef.current.length >= MAX_REGIONS) return;
      const next = [...liveRef.current, regionAroundNormPoint(onCreateId(), norm.x, norm.y)];
      setSelectedId(next[next.length - 1]?.id ?? null);
      commit(next);
      return;
    }
    if (current.moved) commit(liveRef.current);
  };

  const removeSelected = () => {
    if (!selectedId) return;
    const next = live.filter((region) => region.id !== selectedId);
    setSelectedId(next[next.length - 1]?.id ?? null);
    commit(next);
  };

  return (
    <View style={styles.wrap} testID="yarn-region-selector">
      <View
        accessibilityLabel="Yarn photo. Tap the yarn to select it."
        style={[styles.frame, { aspectRatio: aspect }]}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          setFrame({ width, height });
        }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(event) => onGrant(event.nativeEvent.locationX, event.nativeEvent.locationY)}
        onResponderMove={(event) => onMove(event.nativeEvent.locationX, event.nativeEvent.locationY)}
        onResponderRelease={(event) => onRelease(event.nativeEvent.locationX, event.nativeEvent.locationY)}
      >
        <Image
          accessible={false}
          source={{ uri: imageUri }}
          resizeMode="contain"
          style={styles.image}
          onLoad={(event) => {
            const source = event.nativeEvent.source;
            if (source.width > 0 && source.height > 0) onImageSize(source.width, source.height);
          }}
        />
        {ready
          ? live.map((region, index) => {
              const box = imageNormRectToFrame(region, frame.width, frame.height, imageWidth, imageHeight);
              const selected = region.id === selectedId;
              return (
                <View
                  key={region.id}
                  pointerEvents="none"
                  style={[
                    styles.region,
                    {
                      left: box.x,
                      top: box.y,
                      width: box.width,
                      height: box.height,
                    },
                    selected ? styles.regionOn : styles.regionOff,
                  ]}
                >
                  <Text style={styles.regionIndex}>{index + 1}</Text>
                  {selected ? (
                    <>
                      <View style={[styles.handle, styles.handleNw]} />
                      <View style={[styles.handle, styles.handleNe]} />
                      <View style={[styles.handle, styles.handleSw]} />
                      <View style={[styles.handle, styles.handleSe]} />
                    </>
                  ) : null}
                </View>
              );
            })
          : null}
      </View>
      <Text style={styles.hint}>
        {live.length === 0 ? 'Tap the yarn. Tap again to add another ball.' : 'Drag a box to adjust it. Corners resize it.'}
      </Text>
      {live.length > 0 ? (
        <View style={styles.tools}>
          {live.map((region, index) => {
            const selected = region.id === selectedId;
            return (
              <Pressable
                key={region.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`Yarn area ${index + 1}`}
                onPress={() => setSelectedId(region.id)}
                style={({ pressed }) => [styles.tool, selected && styles.toolOn, pressed && styles.pressed, webCursor]}
              >
                <Text style={[styles.toolText, selected && styles.toolTextOn]}>Yarn {index + 1}</Text>
              </Pressable>
            );
          })}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Remove selected yarn area"
            onPress={removeSelected}
            style={({ pressed }) => [styles.tool, pressed && styles.pressed, webCursor]}
          >
            <Text style={styles.removeText}>Remove</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const webCursor = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : null;

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.sm,
  },
  frame: {
    width: '100%',
    maxHeight: 320,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.elevatedControl,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  region: {
    position: 'absolute',
    borderWidth: 2,
    borderRadius: Radius.sm,
  },
  regionOn: {
    borderColor: Colors.accentPrimary,
    backgroundColor: Colors.accentMuted,
  },
  regionOff: {
    borderColor: Colors.textPrimary,
    backgroundColor: Colors.transparent,
  },
  regionIndex: {
    ...Typography.caption,
    color: Colors.textPrimary,
    margin: Spacing.xxs,
  },
  handle: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: Radius.pill,
    backgroundColor: Colors.accentPrimary,
    borderWidth: 2,
    borderColor: Colors.cardSurface,
  },
  handleNw: { left: -8, top: -8 },
  handleNe: { right: -8, top: -8 },
  handleSw: { left: -8, bottom: -8 },
  handleSe: { right: -8, bottom: -8 },
  hint: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  tools: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  tool: {
    minHeight: 44,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.elevatedControl,
    borderWidth: 1,
    borderColor: Colors.transparent,
  },
  toolOn: {
    backgroundColor: Colors.accentMuted,
    borderColor: Colors.accentPrimary,
  },
  toolText: {
    ...Typography.caption,
    color: Colors.textPrimary,
  },
  toolTextOn: {
    color: Colors.accentPrimary,
  },
  removeText: {
    ...Typography.caption,
    color: Colors.danger,
  },
  pressed: {
    opacity: 0.72,
  },
});
