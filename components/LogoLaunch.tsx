import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  AppState,
  Easing,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { Colors } from '@/constants/BambuTheme';

// Tuning controls: milliseconds and logical points.
const SPRING = {
  mass: 1,
  stiffness: 230,
  damping: 2 * Math.sqrt(230), // Critical damping.
  restDisplacementThreshold: 0.001,
  restSpeedThreshold: 0.001,
};
const TIMING = {
  anticipationMs: 160,
  liftMs: 220,
  hookDelayMs: 100,
  hookDipMs: 205,
  hookPullMs: 230,
  layerFadeMs: 100,
  settleHoldMs: 140,
  reducedHoldMs: 180,
};
const MOTION = {
  logoPt: 300,
  widthRatio: 0.78,
  heightRatio: 0.42,
  dipY: 7,
  liftY: -13,
  dipScaleX: 1.028,
  dipScaleY: 0.965,
  liftScale: 1.055,
  dipRotationDeg: -2.2,
  liftRotationDeg: 1.5,
  hookDipX: -4,
  hookDipY: 5,
  hookPullX: 3,
  hookPullY: -6,
  hookDipRotationDeg: -5,
  hookPullRotationDeg: 3.5,
};
const ORIGINAL = require('@/assets/logo-cutout.png');
const BALL = require('@/assets/yarn-ball.png');
const HOOK = require('@/assets/crochet-hook.png');

type Props = { active: boolean; onReady: () => void; onFinished: () => void };

export default function LogoLaunch({ active, onReady, onFinished }: Props) {
  const { width, height } = useWindowDimensions();
  const size = Math.max(1, Math.min(MOTION.logoPt, width * MOTION.widthRatio, height * MOTION.heightRatio));
  const progress = useRef(new Animated.Value(0)).current;
  const hookProgress = useRef(new Animated.Value(0)).current;
  const reveal = useRef(new Animated.Value(0)).current;
  const finished = useRef(false);
  const readySent = useRef(false);
  const callback = useRef({ onReady, onFinished });
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  const [foreground, setForeground] = useState(AppState.currentState !== 'background');
  callback.current = { onReady, onFinished };

  const signalReady = () => {
    if (readySent.current) return;
    readySent.current = true;
    callback.current.onReady();
  };

  useEffect(() => {
    signalReady();
  }, []);

  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(enabled => { if (live) setReduceMotion(enabled); })
      .catch(() => { if (live) setReduceMotion(false); });
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    const appState = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => { live = false; motion.remove(); appState.remove(); };
  }, []);

  useEffect(() => {
    if (!active || !foreground || reduceMotion === null || finished.current) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      if (!live || finished.current) return;
      finished.current = true;
      callback.current.onFinished();
    };
    progress.setValue(0);
    hookProgress.setValue(0);
    reveal.setValue(0);
    if (reduceMotion) {
      timer = setTimeout(finish, TIMING.reducedHoldMs);
      return () => { live = false; clearTimeout(timer); };
    }
    const timing = (value: Animated.Value, toValue: number, duration: number) =>
      Animated.timing(value, {
        toValue,
        duration,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
        isInteraction: false,
      });
    const animation = Animated.sequence([
      timing(reveal, 1, TIMING.layerFadeMs),
      Animated.parallel([
        Animated.sequence([
          timing(progress, 1, TIMING.anticipationMs),
          timing(progress, 2, TIMING.liftMs),
          Animated.spring(progress, {
            ...SPRING, toValue: 3, useNativeDriver: true, isInteraction: false,
          }),
        ]),
        Animated.sequence([
          Animated.delay(TIMING.hookDelayMs),
          timing(hookProgress, 1, TIMING.hookDipMs),
          timing(hookProgress, 2, TIMING.hookPullMs),
          Animated.spring(hookProgress, {
            ...SPRING, toValue: 3, useNativeDriver: true, isInteraction: false,
          }),
        ]),
      ]),
      Animated.delay(TIMING.settleHoldMs),
      timing(reveal, 0, TIMING.layerFadeMs),
    ]);
    animation.start(({ finished: complete }) => {
      if (complete && live) finish();
    });
    return () => { live = false; clearTimeout(timer); animation.stop(); };
  }, [active, foreground, reduceMotion, progress, hookProgress, reveal]);

  const originalOpacity = reveal.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const ballMotion = {
    opacity: reveal,
    transform: [
      { translateY: progress.interpolate({ inputRange: [0, 1, 2, 3], outputRange: [0, MOTION.dipY, MOTION.liftY, 0] }) },
      { rotate: progress.interpolate({ inputRange: [0, 1, 2, 3], outputRange: ['0deg', `${MOTION.dipRotationDeg}deg`, `${MOTION.liftRotationDeg}deg`, '0deg'] }) },
      { scaleX: progress.interpolate({ inputRange: [0, 1, 2, 3], outputRange: [1, MOTION.dipScaleX, MOTION.liftScale, 1] }) },
      { scaleY: progress.interpolate({ inputRange: [0, 1, 2, 3], outputRange: [1, MOTION.dipScaleY, MOTION.liftScale, 1] }) },
    ],
  };
  const hookMotion = {
    opacity: reveal,
    transform: [
      { translateX: hookProgress.interpolate({ inputRange: [0, 1, 2, 3], outputRange: [0, MOTION.hookDipX, MOTION.hookPullX, 0] }) },
      { translateY: hookProgress.interpolate({ inputRange: [0, 1, 2, 3], outputRange: [0, MOTION.hookDipY, MOTION.hookPullY, 0] }) },
      { rotate: hookProgress.interpolate({ inputRange: [0, 1, 2, 3], outputRange: ['0deg', `${MOTION.hookDipRotationDeg}deg`, `${MOTION.hookPullRotationDeg}deg`, '0deg'] }) },
    ],
  };
  const layer = { width: size, height: size };

  return (
    <View style={styles.overlay} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={layer}>
        <Animated.Image source={BALL} onLoad={signalReady}
          resizeMode="contain" style={[styles.layer, layer, ballMotion]} />
        <Animated.Image source={HOOK} onLoad={signalReady}
          resizeMode="contain" style={[styles.layer, layer, hookMotion]} />
        <Animated.Image source={ORIGINAL} onLoad={signalReady}
          resizeMode="contain" style={[styles.layer, layer, { opacity: originalOpacity }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: Colors.backgroundPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  layer: { position: 'absolute', left: 0, top: 0 },
});
