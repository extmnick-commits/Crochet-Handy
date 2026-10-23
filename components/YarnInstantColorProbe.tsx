/**
 * Full-photo color sample via a hidden WebView. Runs in parallel with on-device vision.
 */
import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { Radius } from '@/constants/BambuTheme';
import { detectYarnColors, yarnColorProbeHtml, yarnColorsFromProbeMessage, type ScrapYarnColor } from '@/utils/scrapYarnAi';
import { prepareYarnColorProbeUri } from '@/utils/yarnColorExtractor';

type YarnInstantColorProbeProps = {
  imageUri: string;
  photoGeneration: number;
  onColors: (colors: ScrapYarnColor[]) => void;
};

export function YarnInstantColorProbe({ imageUri, photoGeneration, onColors }: YarnInstantColorProbeProps) {
  const [probeUri, setProbeUri] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState('');
  const onColorsRef = useRef(onColors);
  useEffect(() => {
    onColorsRef.current = onColors;
  });

  useEffect(() => {
    let cancelled = false;
    const token = `${imageUri}:${photoGeneration}`;
    void (async () => {
      if (Platform.OS === 'web') {
        const colors = await detectYarnColors(imageUri);
        if (!cancelled) onColorsRef.current(colors);
        return;
      }
      const uri = await prepareYarnColorProbeUri(imageUri);
      if (!cancelled) {
        setProbeUri(uri);
        setLoadedFor(token);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [imageUri, photoGeneration]);

  const probeReady = loadedFor === `${imageUri}:${photoGeneration}` && probeUri != null;
  if (Platform.OS === 'web' || !probeReady) return null;

  return (
    <View pointerEvents="none" style={styles.hidden}>
      <WebView
        originWhitelist={['*']}
        source={{ html: yarnColorProbeHtml(probeUri) }}
        onMessage={(event) => {
          onColorsRef.current(yarnColorsFromProbeMessage(event.nativeEvent.data));
        }}
        style={styles.webview}
      />
    </View>
  );
}

export function YarnColorSwatchRow({ colors }: { colors: readonly ScrapYarnColor[] }) {
  if (colors.length === 0) return null;
  return (
    <View style={styles.row}>
      {colors.map((color) => (
        <View key={color.hex} accessibilityLabel={color.name} style={[styles.swatch, { backgroundColor: color.hex }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    overflow: 'hidden',
  },
  webview: {
    width: 1,
    height: 1,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  swatch: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
  },
});
