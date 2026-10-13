import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { Colors, Radius } from '@/constants/BambuTheme';

type BrandMarkProps = {
  size?: number;
};

/** Crochet Handy app mark: a neon yarn ball on a rounded tile. */
export function BrandMark({ size = 36 }: BrandMarkProps) {
  const glyph = size * 0.62;

  return (
    <View
      style={[styles.tile, { width: size, height: size, borderRadius: Math.round(size * 0.28) }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg width={glyph} height={glyph} viewBox="0 0 24 24" fill="none">
        <Circle cx={12} cy={12} r={8.5} stroke={Colors.onAccent} strokeWidth={2} />
        <Path
          d="M5.2 8.6 C9 7.2 15 7.6 19.4 11 M4.2 12.8 C8.6 11.2 15.4 12 19.6 15.6 M7 18.4 C10 16.2 15 16.2 17.6 18.6"
          stroke={Colors.onAccent}
          strokeWidth={1.7}
          strokeLinecap="round"
        />
        <Path d="M19.6 15.6 C21 17.6 21.6 19.6 22.4 21.4" stroke={Colors.onAccent} strokeWidth={1.7} strokeLinecap="round" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accentPrimary,
    borderRadius: Radius.md,
  },
});
