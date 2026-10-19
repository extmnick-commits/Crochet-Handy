import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, Image, Platform, StyleSheet, Text, View } from 'react-native';

import { Colors, Radius, Spacing, Typography } from '@/constants/BambuTheme';

const TIMING = { scanMs: 1800, logoHalfMs: 900 };
const MOTION = { photoHeight: 220, logoSize: 96, ballLift: -4, hookPull: -5, hookDegrees: 5 };
// Sampled from assets/yarn-ball.png; the original artwork supplies all other colors.
const COLORS = { scan: '#37EE79', veil: 'rgba(0, 0, 0, 0.42)' };
const BALL = require('@/assets/yarn-ball.png');
const HOOK = require('@/assets/crochet-hook.png');
const ORIGINAL = require('@/assets/logo-cutout.png');
const NATIVE = Platform.OS !== 'web';

/** Only mounted while a scan is active. No simulated percentages for inference. */
export function YarnScanLoading({ photoUri, label, progress }: {
  photoUri: string;
  label: string;
  progress: number | null;
}) {
  const [scan] = useState(() => new Animated.Value(0));
  const [logo] = useState(() => new Animated.Value(0));
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  const [foreground, setForeground] = useState(AppState.currentState === 'active' || AppState.currentState == null);

  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (live) setReduceMotion(value);
    }).catch(() => { if (live) setReduceMotion(true); });
    const accessibility = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    const app = AppState.addEventListener('change', (state) => setForeground(state === 'active'));
    return () => { live = false; accessibility.remove(); app.remove(); };
  }, []);

  useEffect(() => {
    scan.setValue(0);
    logo.setValue(0);
    if (reduceMotion !== false || !foreground) return;
    const timing = (value: Animated.Value, toValue: number, duration: number) => Animated.timing(value, {
      toValue, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE, isInteraction: false,
    });
    const animation = Animated.parallel([
      Animated.loop(Animated.sequence([timing(scan, 1, TIMING.scanMs), timing(scan, 0, TIMING.scanMs)])),
      Animated.loop(Animated.sequence([timing(logo, 1, TIMING.logoHalfMs), timing(logo, 0, TIMING.logoHalfMs)])),
    ]);
    animation.start();
    return () => animation.stop();
  }, [foreground, logo, reduceMotion, scan]);

  const percent = progress == null ? null : Math.round(Math.max(0, Math.min(1, progress)) * 100);
  return (
    <View style={styles.root} testID="leftover-scan-loading" accessibilityLiveRegion="polite">
      <View style={styles.photoFrame} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Image source={{ uri: photoUri }} resizeMode="cover" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, styles.veil]} />
        {reduceMotion === false && foreground ? (
          <Animated.View pointerEvents="none" style={[styles.scanLine, {
            transform: [{ translateY: scan.interpolate({ inputRange: [0, 1], outputRange: [0, MOTION.photoHeight - 3] }) }],
          }]} />
        ) : null}
        <View style={styles.logo} pointerEvents="none">
          {reduceMotion !== false ? <Image source={ORIGINAL} resizeMode="contain" style={styles.layer} /> : (
            <>
              <Animated.Image source={BALL} resizeMode="contain" style={[styles.layer, {
                transform: [{ translateY: logo.interpolate({ inputRange: [0, 1], outputRange: [0, MOTION.ballLift] }) }],
              }]} />
              <Animated.Image source={HOOK} resizeMode="contain" style={[styles.layer, {
                transform: [
                  { translateY: logo.interpolate({ inputRange: [0, 1], outputRange: [0, MOTION.hookPull] }) },
                  { rotate: logo.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${MOTION.hookDegrees}deg`] }) },
                ],
              }]} />
            </>
          )}
        </View>
      </View>
      <Text style={styles.label}>{label}{percent == null ? '…' : ` · ${percent}%`}</Text>
      <Text style={styles.note}>Your photo stays on your phone.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: Spacing.sm },
  photoFrame: { height: MOTION.photoHeight, borderRadius: Radius.lg, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  veil: { backgroundColor: COLORS.veil },
  scanLine: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: COLORS.scan },
  logo: { width: MOTION.logoSize, height: MOTION.logoSize },
  layer: { position: 'absolute', width: MOTION.logoSize, height: MOTION.logoSize, top: 0, left: 0 },
  label: { ...Typography.label, color: Colors.textPrimary, textAlign: 'center' },
  note: { ...Typography.caption, color: Colors.textSecondary, textAlign: 'center' },
});
