/**
 * Detected yarn colors for a photo. Tapping a pill keeps or drops it.
 * The plus chip adds a named color from the craft dictionary.
 */
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { Colors, FontFamily, FontWeight, Radius, Spacing, Typography } from '@/constants/BambuTheme';
import {
  YARN_COLOR_DICTIONARY,
  YARN_COLOR_FAMILIES,
  extractYarnColorsFromUri,
  isYarnNativePaletteAvailable,
  prepareYarnColorProbeUri,
  yarnColorSampleHtml,
  yarnSwatchesFromProbeMessage,
  type YarnNamedColor,
} from '@/utils/yarnColorExtractor';

const DEFAULT_MAX_COLORS = 5;

type YarnColorSwatchPickerProps = {
  imageUri: string | null;
  onChange: (colors: YarnNamedColor[]) => void;
  maxColors?: number;
};

export function YarnColorSwatchPicker({ imageUri, onChange, maxColors = DEFAULT_MAX_COLORS }: YarnColorSwatchPickerProps) {
  if (!imageUri) return null;
  return <PickerForPhoto key={imageUri} imageUri={imageUri} maxColors={maxColors} onChange={onChange} />;
}

function PickerForPhoto({
  imageUri,
  onChange,
  maxColors,
}: {
  imageUri: string;
  onChange: (colors: YarnNamedColor[]) => void;
  maxColors: number;
}) {
  const [swatches, setSwatches] = useState<YarnNamedColor[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [status, setStatus] = useState<'reading' | 'ready' | 'empty'>('reading');
  const [adding, setAdding] = useState(false);
  const [probeUri, setProbeUri] = useState<string | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let cancelled = false;

    const publish = (colors: YarnNamedColor[]) => {
      const next = colors.slice(0, maxColors);
      setSwatches(next);
      setSelected(next.map((color) => color.hex));
      setStatus(next.length > 0 ? 'ready' : 'empty');
      onChangeRef.current(next);
    };

    void extractYarnColorsFromUri(imageUri).then(async (colors) => {
      if (cancelled) return;
      if (colors.length > 0) {
        publish(colors);
        return;
      }
      if (Platform.OS === 'web') {
        publish([]);
        return;
      }
      const sampleUri = await prepareYarnColorProbeUri(imageUri);
      if (cancelled) return;
      setProbeUri(sampleUri);
    });

    return () => {
      cancelled = true;
    };
  }, [imageUri, maxColors]);

  useEffect(() => {
    if (!probeUri) return undefined;
    const timer = setTimeout(() => {
      setProbeUri(null);
      setSwatches([]);
      setSelected([]);
      setStatus('empty');
      onChangeRef.current([]);
    }, 15000);
    return () => clearTimeout(timer);
  }, [probeUri]);

  const emit = (nextSwatches: YarnNamedColor[], nextSelected: readonly string[]) => {
    onChangeRef.current(nextSwatches.filter((swatch) => nextSelected.includes(swatch.hex)));
  };

  const toggle = (color: YarnNamedColor) => {
    const next = selected.includes(color.hex)
      ? selected.filter((hex) => hex !== color.hex)
      : selected.length >= maxColors
        ? selected
        : [...selected, color.hex];
    if (next === selected) return;
    setSelected(next);
    emit(swatches, next);
  };

  const addColor = (color: YarnNamedColor) => {
    const nextSwatches = [color, ...swatches.filter((item) => item.hex !== color.hex && item.name !== color.name)].slice(0, maxColors);
    const nextSelected = [color.hex, ...selected.filter((hex) => hex !== color.hex)].slice(0, maxColors);
    setSwatches(nextSwatches);
    setSelected(nextSelected);
    setStatus('ready');
    setAdding(false);
    emit(nextSwatches, nextSelected);
  };

  const onProbeMessage = (message: string) => {
    setProbeUri(null);
    const colors = yarnSwatchesFromProbeMessage(message).slice(0, maxColors);
    setSwatches(colors);
    setSelected(colors.map((color) => color.hex));
    setStatus(colors.length > 0 ? 'ready' : 'empty');
    onChangeRef.current(colors);
  };

  const readAccess =
    probeUri && probeUri.startsWith('file://') ? probeUri.slice(0, probeUri.lastIndexOf('/') + 1) : undefined;
  const limit = Math.max(1, maxColors);

  return (
    <View style={styles.wrap} testID="yarn-color-swatch-picker">
      {status === 'reading' ? (
        <View style={styles.reading}>
          <ActivityIndicator color={Colors.accentPrimary} />
          <Text style={styles.hint}>Reading yarn colors…</Text>
        </View>
      ) : (
        <Text style={styles.hint}>
          {status === 'empty'
            ? isYarnNativePaletteAvailable()
              ? 'No yarn color stood out in this photo. Tap + to add one.'
              : 'No colors detected from this photo. Tap + to add one.'
            : 'Tap a swatch to keep or drop a color. These swatches come from the photo sampler. The text model does not see the photo.'}
        </Text>
      )}

      {status !== 'reading' ? (
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
        >
          {swatches.map((color) => {
            const on = selected.includes(color.hex);
            return (
              <Pressable
                key={`${color.hex}-${color.name}`}
                accessibilityRole="button"
                accessibilityLabel={`${color.name} ${color.hex}`}
                accessibilityState={{ selected: on }}
                onPress={() => toggle(color)}
                style={({ pressed }) => [styles.pill, on && styles.pillOn, !on && styles.pillOff, pressed && styles.pressed, webCursor]}
              >
                <View style={[styles.dot, { backgroundColor: color.hex }, on && styles.dotOn]} />
                <View style={styles.pillCopy}>
                  <Text numberOfLines={1} style={[styles.name, on && styles.nameOn]}>
                    {color.name}
                  </Text>
                  <Text numberOfLines={1} style={styles.hex}>
                    {color.hex}
                  </Text>
                </View>
              </Pressable>
            );
          })}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add a yarn color"
            accessibilityState={{ expanded: adding }}
            onPress={() => setAdding((open) => !open)}
            style={({ pressed }) => [styles.addChip, adding && styles.pillOn, pressed && styles.pressed, webCursor]}
          >
            <Text style={styles.addGlyph}>+</Text>
          </Pressable>
        </ScrollView>
      ) : null}

      {adding ? (
        <ScrollView nestedScrollEnabled style={styles.dictionary} contentContainerStyle={styles.dictionaryContent}>
          {YARN_COLOR_FAMILIES.map((family) => {
            const colors = YARN_COLOR_DICTIONARY.filter((color) => color.family === family);
            if (colors.length === 0) return null;
            return (
              <View key={family} style={styles.family}>
                <Text style={styles.familyLabel}>{family}</Text>
                <View style={styles.familyRow}>
                  {colors.map((color) => {
                    const on = selected.includes(color.hex);
                    return (
                      <Pressable
                        key={`${family}-${color.hex}`}
                        accessibilityRole="button"
                        accessibilityLabel={`Add ${color.name}`}
                        accessibilityState={{ selected: on }}
                        onPress={() => addColor(color)}
                        style={({ pressed }) => [styles.dictionaryItem, pressed && styles.pressed, webCursor]}
                      >
                        <View style={[styles.dot, { backgroundColor: color.hex }, on && styles.dotOn]} />
                        <Text numberOfLines={2} style={styles.dictionaryName}>
                          {color.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          })}
          <Text style={styles.hint}>Up to {limit} colors stay selected.</Text>
        </ScrollView>
      ) : null}

      {probeUri && Platform.OS !== 'web' ? (
        <WebView
          originWhitelist={['*']}
          source={{ html: yarnColorSampleHtml(probeUri) }}
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
  },
  hint: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  row: {
    gap: Spacing.sm,
    paddingVertical: Spacing.xxs,
  },
  pill: {
    width: 148,
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.pill,
    backgroundColor: Colors.elevatedControl,
    borderWidth: 1,
    borderColor: Colors.transparent,
  },
  pillOn: {
    backgroundColor: Colors.accentMuted,
    borderColor: Colors.accentPrimary,
  },
  pillOff: {
    opacity: 0.48,
  },
  pillCopy: {
    flex: 1,
    gap: 1,
  },
  dot: {
    width: 28,
    height: 28,
    borderRadius: Radius.pill,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  dotOn: {
    borderColor: Colors.accentPrimary,
  },
  name: {
    ...Typography.caption,
    color: Colors.textPrimary,
    fontWeight: FontWeight.semibold,
  },
  nameOn: {
    color: Colors.accentPrimary,
  },
  hex: {
    ...Typography.caption,
    fontFamily: FontFamily.mono,
    color: Colors.textSecondary,
  },
  addChip: {
    width: 56,
    minHeight: 56,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.elevatedControl,
    borderWidth: 1,
    borderColor: Colors.transparent,
  },
  addGlyph: {
    ...Typography.headline,
    color: Colors.textPrimary,
  },
  dictionary: {
    maxHeight: 280,
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
