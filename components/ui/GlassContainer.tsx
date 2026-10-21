/**
 * Cross-platform frosted surface.
 *
 * iOS 26 with the native module draws Liquid Glass. Older iOS and web use
 * expo-blur. Android keeps a Bambu card with a hairline and light elevation —
 * the dark canvas would turn chalky under a white frost. Reduced transparency
 * always falls back to a solid card.
 */
import { BlurView, type BlurTint } from 'expo-blur';
import { isLiquidGlassSupported, LiquidGlassView, type LiquidGlassBlurStyle } from 'liquid-glass';
import { useEffect, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';

import { Colors, Elevation, Layout } from '@/constants/BambuTheme';

export type GlassContainerProps = ViewProps & {
  children?: ReactNode;
  cornerRadius?: number;
  blurStyle?: LiquidGlassBlurStyle;
  isInteractive?: boolean;
  /** Draws a hairline. Full-bleed bars that already have a seam can turn this off. */
  bordered?: boolean;
  /** Soft shadow for floating pills and HUD cards. */
  elevated?: boolean;
  style?: StyleProp<ViewStyle>;
};

const BLUR_INTENSITY: Record<LiquidGlassBlurStyle, number> = {
  ultraThin: 28,
  thin: 42,
  regular: 64,
  prominent: 88,
};

const BLUR_TINT: Record<LiquidGlassBlurStyle, BlurTint> = {
  ultraThin: 'systemUltraThinMaterialDark',
  thin: 'systemThinMaterialDark',
  regular: 'systemChromeMaterialDark',
  prominent: 'systemThickMaterialDark',
};

function useReduceTransparency(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceTransparencyEnabled()
      .then((value) => {
        if (mounted) setEnabled(value);
      })
      .catch(() => {
        if (mounted) setEnabled(false);
      });
    const subscription = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setEnabled);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return enabled;
}

export function GlassContainer({
  children,
  cornerRadius = 16,
  blurStyle = 'regular',
  isInteractive = false,
  bordered = true,
  elevated = false,
  style,
  ...rest
}: GlassContainerProps) {
  const reduceTransparency = useReduceTransparency();
  const nativeGlass = !reduceTransparency && isLiquidGlassSupported();
  const legacyBlur = !reduceTransparency && !nativeGlass && Platform.OS !== 'android';

  const frame: ViewStyle = {
    borderRadius: cornerRadius,
    overflow: 'hidden',
  };
  const hairline: ViewStyle | null = bordered
    ? { borderWidth: Layout.hairline, borderColor: Colors.glassBorder }
    : null;
  const shadow = elevated ? Elevation.glass : null;
  const solid: ViewStyle = {
    backgroundColor: Platform.OS === 'android' ? Colors.cardSurface : Colors.glassSurface,
  };

  if (nativeGlass) {
    return (
      <LiquidGlassView
        {...rest}
        blurStyle={blurStyle}
        cornerRadius={cornerRadius}
        isInteractive={isInteractive}
        style={[frame, hairline, shadow, style, styles.clear]}
      >
        {children}
      </LiquidGlassView>
    );
  }

  return (
    <View {...rest} style={[frame, hairline, shadow, style, legacyBlur ? styles.clear : solid]}>
      {legacyBlur ? (
        <BlurView
          intensity={BLUR_INTENSITY[blurStyle]}
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
          tint={BLUR_TINT[blurStyle]}
        />
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  clear: {
    backgroundColor: Colors.transparent,
  },
});
