/**
 * Confirmed yarn colors for the selected regions.
 * Sampling waits for a region and ignores a result if the photo or the edit changes.
 */
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { Colors, Radius, Spacing, Typography } from '@/constants/BambuTheme';
import {
  type ExtractionStamp,
} from '@/utils/leftoverYarnDraft';
import {
  YARN_COLOR_DICTIONARY,
  YARN_COLOR_FAMILIES,
  cropYarnRegions,
  extractYarnColorsFromRegions,
  yarnCropSampleHtml,
  yarnSwatchesFromProbeMessage,
} from '@/utils/yarnColorExtractor';
import { pixelCrop, regionSampleKey, type YarnSampleRegion } from '@/utils/yarnRegion';

const DEFAULT_MAX_COLORS = 4;

type Probe = {
  uris: string[];
  stamp: ExtractionStamp;
};

type YarnColorSwatchPickerProps = {
  imageUri: string;
  imageWidth: number;
  imageHeight: number;
  regions: readonly YarnSampleRegion[];
  photoGeneration: number;
  colors: readonly { name: string; hex: string }[];
  sampledKey: string | null;
  onSampled: (stamp: ExtractionStamp, colors: { name: string; hex: string }[]) => void;
  onEditColors: (colors: { name: string; hex: string }[]) => void;
  maxColors?: number;
};

export function YarnColorSwatchPicker({
  imageUri,
  imageWidth,
  imageHeight,
  regions,
  photoGeneration,
  colors,
  sampledKey,
  onSampled,
  onEditColors,
  maxColors = DEFAULT_MAX_COLORS,
}: YarnColorSwatchPickerProps) {
  const sampleKey = regionSampleKey(photoGeneration, regions);
  const [probe, setProbe] = useState<Probe | null>(null);
  const [editing, setEditing] = useState(false);
  const onSampledRef = useRef(onSampled);
  useEffect(() => {
    onSampledRef.current = onSampled;
  });
  const pending = regions.length > 0 && sampledKey !== sampleKey;
  const selected = colors.map((color) => color.hex);

  useEffect(() => {
    if (!imageUri || regions.length === 0 || imageWidth < 1 || imageHeight < 1) return undefined;
    if (sampledKey === sampleKey) return undefined;
    const stamp: ExtractionStamp = { generation: photoGeneration, sampleKey };
    const crops = regions.map((region) => pixelCrop(region, imageWidth, imageHeight));
    let cancelled = false;

    void (async () => {
      if (typeof document !== 'undefined') {
        const next = await extractYarnColorsFromRegions(imageUri, regions, imageWidth, imageHeight);
        if (cancelled) return;
        onSampledRef.current(stamp, next.slice(0, maxColors));
        return;
      }
      const cropped = await cropYarnRegions(imageUri, crops);
      if (cancelled) return;
      if (cropped.length !== crops.length) {
        onSampledRef.current(stamp, []);
        return;
      }
      setProbe({ uris: cropped, stamp });
    })();

    return () => {
      cancelled = true;
      setProbe(null);
    };
  }, [imageHeight, imageUri, imageWidth, maxColors, photoGeneration, regions, sampleKey, sampledKey]);

  const emit = (next: { name: string; hex: string }[]) => {
    onEditColors(next.slice(0, maxColors));
  };

  const toggle = (color: { name: string; hex: string }) => {
    const next = selected.includes(color.hex)
      ? colors.filter((item) => item.hex !== color.hex)
      : colors.length >= maxColors
        ? [...colors]
        : [...colors, color];
    if (next.length === colors.length && next.every((item, index) => item.hex === colors[index]?.hex)) return;
    emit(next);
  };

  const addColor = (color: { name: string; hex: string }) => {
    const next = [color, ...colors.filter((item) => item.hex !== color.hex && item.name !== color.name)].slice(0, maxColors);
    emit(next);
    setEditing(false);
  };

  const onProbeMessage = (message: string) => {
    const current = probe;
    setProbe(null);
    if (!current) return;
    const next = yarnSwatchesFromProbeMessage(message).slice(0, maxColors);
    onSampledRef.current(current.stamp, next);
  };

  const readAccess = probe?.uris[0]?.startsWith('file://')
    ? probe.uris[0].slice(0, probe.uris[0].lastIndexOf('/') + 1)
    : undefined;

  return (
    <View style={styles.wrap} testID="yarn-color-swatch-picker">
      {pending ? (
        <View style={styles.reading}>
          <ActivityIndicator color={Colors.accentPrimary} />
          <Text style={styles.hint}>Reading the yarn…</Text>
        </View>
      ) : (
        <View style={styles.headerRow}>
          <Text style={styles.hint}>
            {colors.length === 0 ? 'No color in this selection.' : 'Colors from the yarn you selected.'}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: editing }}
            accessibilityLabel="Edit colors"
            testID="leftover-edit-colors"
            onPress={() => setEditing((open) => !open)}
            style={({ pressed }) => [styles.edit, pressed && styles.pressed, webCursor]}
          >
            <Text style={styles.editText}>{editing ? 'Done' : 'Edit colors'}</Text>
          </Pressable>
        </View>
      )}

      {!pending ? (
        <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {colors.map((color) => (
            <Pressable
              key={`${color.hex}-${color.name}`}
              accessibilityRole="button"
              accessibilityLabel={editing ? `${color.name} ${color.hex}` : color.name}
              testID="leftover-color-chip"
              onPress={() => toggle(color)}
              style={({ pressed }) => [styles.chip, pressed && styles.pressed, webCursor]}
            >
              <View style={[styles.dot, { backgroundColor: color.hex }]} />
              <Text numberOfLines={1} style={styles.name}>
                {color.name}
              </Text>
              {editing ? <Text style={styles.hex}>{color.hex}</Text> : null}
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {editing && !pending ? (
        <ScrollView nestedScrollEnabled style={styles.dictionary} contentContainerStyle={styles.dictionaryContent}>
          {YARN_COLOR_FAMILIES.map((family) => {
            const familyColors = YARN_COLOR_DICTIONARY.filter((color) => color.family === family);
            if (familyColors.length === 0) return null;
            return (
              <View key={family} style={styles.family}>
                <Text style={styles.familyLabel}>{family}</Text>
                <View style={styles.familyRow}>
                  {familyColors.map((color) => (
                    <Pressable
                      key={`${family}-${color.hex}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Add ${color.name}`}
                      onPress={() => addColor(color)}
                      style={({ pressed }) => [styles.dictionaryItem, pressed && styles.pressed, webCursor]}
                    >
                      <View style={[styles.dot, { backgroundColor: color.hex }]} />
                      <Text numberOfLines={2} style={styles.dictionaryName}>
                        {color.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            );
          })}
        </ScrollView>
      ) : null}

      {probe && Platform.OS !== 'web' ? (
        <WebView
          originWhitelist={['*']}
          source={{ html: yarnCropSampleHtml(probe.uris) }}
          allowingReadAccessToURL={readAccess}
          onMessage={(event) => onProbeMessage(event.nativeEvent.data)}
          style={styles.probe}
        />
      ) : null}
    </View>
  );
}

const webCursor = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : null;

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.sm,
  },
  reading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: 44,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  hint: {
    ...Typography.caption,
    flex: 1,
    color: Colors.textSecondary,
  },
  edit: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
  },
  editText: {
    ...Typography.caption,
    color: Colors.accentPrimary,
  },
  row: {
    gap: Spacing.sm,
    paddingVertical: Spacing.xxs,
  },
  chip: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    backgroundColor: Colors.elevatedControl,
  },
  dot: {
    width: 22,
    height: 22,
    borderRadius: Radius.pill,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  name: {
    ...Typography.caption,
    color: Colors.textPrimary,
  },
  hex: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  dictionary: {
    maxHeight: 240,
    borderRadius: Radius.md,
    backgroundColor: Colors.elevatedControl,
  },
  dictionaryContent: {
    padding: Spacing.sm,
    gap: Spacing.md,
  },
  family: {
    gap: Spacing.xs,
  },
  familyLabel: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  familyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  dictionaryItem: {
    width: 76,
    minHeight: 44,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  dictionaryName: {
    ...Typography.caption,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.72,
  },
  probe: {
    width: 1,
    height: 1,
    opacity: 0,
  },
});
