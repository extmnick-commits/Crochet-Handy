/**
 * Floating "Added to …" toast after instant collect (Bambu Handy style).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { GlassContainer } from '@/components/ui/GlassContainer';
import { Colors, Elevation, FontWeight, Layout, Palette, Radius, Spacing, Typography } from '@/constants/BambuTheme';

export type CollectToastPayload = {
  patternId: string;
  folderName: string;
  onChange: () => void;
};

let pendingToast: CollectToastPayload | null = null;
let toastListener: ((payload: CollectToastPayload | null) => void) | null = null;

export function showCollectToast(payload: CollectToastPayload) {
  pendingToast = payload;
  toastListener?.(payload);
}

export function CollectToastHost() {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<CollectToastPayload | null>(null);
  const [opacity] = useState(() => new Animated.Value(0));
  const [translateY] = useState(() => new Animated.Value(16));
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 12, duration: 160, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) {
        setToast(null);
        pendingToast = null;
      }
    });
  }, [opacity, translateY]);

  useEffect(() => {
    toastListener = (payload) => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (!payload) {
        dismiss();
        return;
      }
      setToast(payload);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start();
      hideTimer.current = setTimeout(() => dismiss(), 4200);
    };
    if (pendingToast) toastListener(pendingToast);
    return () => {
      toastListener = null;
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [dismiss, opacity, translateY]);

  if (!toast) return null;

  const bottom = Math.max(insets.bottom, Spacing.md) + 56;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.host, { bottom, transform: [{ translateY }] }]}
    >
      <GlassContainer blurStyle="regular" cornerRadius={Radius.pill} isInteractive style={styles.banner}>
        <Animated.View style={[styles.bannerRow, { opacity }]}>
          <SuccessCheckIcon />
          <Text numberOfLines={1} style={styles.message}>
            Added to &quot;{toast.folderName}&quot;
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Change collection"
            onPress={() => {
              dismiss();
              toast.onChange();
            }}
            hitSlop={Layout.hitSlop}
            style={({ pressed }) => [styles.change, pressed && styles.pressed, webCursor]}
          >
            <Text style={styles.changeText}>Change &gt;</Text>
          </Pressable>
        </Animated.View>
      </GlassContainer>
    </Animated.View>
  );
}

function SuccessCheckIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={10} fill={Palette.handyGreen} />
      <Path
        d="M7.5 12.2 L10.5 15.2 L16.8 8.8"
        stroke={Colors.textPrimary}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

const webCursor = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : null;

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: Layout.screenGutter,
    right: Layout.screenGutter,
    zIndex: 100,
    alignItems: 'center',
    ...Elevation.floating,
  },
  banner: {
    maxWidth: 520,
    width: '100%',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.pill,
    backgroundColor: Colors.transparent,
  },
  bannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  message: {
    ...Typography.callout,
    flex: 1,
    color: Colors.textPrimary,
    fontWeight: FontWeight.medium,
  },
  change: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.xs,
  },
  changeText: {
    ...Typography.callout,
    color: Palette.handyGreen,
    fontWeight: FontWeight.semibold,
  },
  pressed: {
    opacity: 0.72,
  },
});
