import { Image, StyleSheet, View } from 'react-native';

import { Radius } from '@/constants/BambuTheme';

const appIcon = require('@/assets/icon.png');

type BrandMarkProps = {
  size?: number;
};

/** Crochet Handy app mark — same artwork as `assets/icon.png`. */
export function BrandMark({ size = 36 }: BrandMarkProps) {
  const radius = Math.round(size * (Radius.md / 36));

  return (
    <View
      style={[styles.wrap, { width: size, height: size, borderRadius: radius }]}
      accessibilityRole="image"
      accessibilityLabel="Crochet Handy"
    >
      <Image
        source={appIcon}
        style={{ width: size, height: size, borderRadius: radius }}
        resizeMode="cover"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
  },
});
