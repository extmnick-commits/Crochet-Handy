import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  AppState,
  Easing,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { Colors } from '@/constants/BambuTheme';

const SPRING = {
  mass: 1,
  stiffness: 280,
  damping: 2 * Math.sqrt(280),
  restDisplacementThreshold: 0.001,
  restSpeedThreshold: 0.001,
};
const TIMING = {
  anticipationMs: 100,
  liftMs: 150,
  hookDelayMs: 60,
  hookDipMs: 140,
  hookPullMs: 160,
  settleHoldMs: 50,
  exitFadeMs: 70,
  reducedHoldMs: 120,
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
const BALL = require('@/assets/yarn-ball.png');
const HOOK = require('@/assets/crochet-hook.png');
const ORIGINAL = require('@/assets/logo-cutout.png');

const USE_NATIVE_DRIVER = Platform.OS !== 'android';
const ANIMATION_WATCHDOG_MS = 1500;

type Props = {
  active: boolean;
  onFinished: () => void;
  /** Repeat the yarn-and-hook motion until this is cleared, then play the exit once. */
  loop?: boolean;
};

export default function LogoLaunch({ active, onFinished, loop = false }: Props) {
  const { width, height } = useWindowDimensions();
  const size = Math.max(1, Math.min(MOTION.logoPt, width * MOTION.widthRatio, height * MOTION.heightRatio));
  const progress = useRef(new Animated.Value(0)).current;
  const hookProgress = useRef(new Animated.Value(0)).current;
  const exit = useRef(new Animated.Value(1)).current;
  const finished = useRef(false);
  const callback = useRef({ onFinished });
  const [reduceMotion, setReduceMotion] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState !== 'background');
  callback.current = { onFinished };

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
    if (!active) {
      finished.current = false;
      return;
    }
    if (!foreground || finished.current) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      if (!live || finished.current) return;
      finished.current = true;
      callback.current.onFinished();
    };
    progress.setValue(0);
    hookProgress.setValue(0);
    exit.setValue(1);
    const timing = (value: Animated.Value, toValue: number, duration: number) =>
      Animated.timing(value, {
        toValue,
        duration,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: USE_NATIVE_DRIVER,
        isInteraction: false,
      });
    const motion = Animated.parallel([
      Animated.sequence([
        timing(progress, 1, TIMING.anticipationMs),
        timing(progress, 2, TIMING.liftMs),
        Animated.spring(progress, {
          ...SPRING, toValue: 3, useNativeDriver: USE_NATIVE_DRIVER, isInteraction: false,
        }),
      ]),
      Animated.sequence([
        Animated.delay(TIMING.hookDelayMs),
        timing(hookProgress, 1, TIMING.hookDipMs),
        timing(hookProgress, 2, TIMING.hookPullMs),
        Animated.spring(hookProgress, {
          ...SPRING, toValue: 3, useNativeDriver: USE_NATIVE_DRIVER, isInteraction: false,
        }),
      ]),
    ]);
    if (loop) {
      if (reduceMotion) return () => { live = false; };
      const play = () => {
        if (!live) return;
        progress.setValue(0);
        hookProgress.setValue(0);
        motion.start(() => {
          if (!live) return;
          timer = setTimeout(play, TIMING.settleHoldMs);
        });
      };
      play();
      return () => {
        live = false;
        clearTimeout(timer);
        motion.stop();
      };
    }
    if (reduceMotion) {
      timer = setTimeout(finish, TIMING.reducedHoldMs);
      return () => { live = false; clearTimeout(timer); };
    }
    watchdog = setTimeout(finish, ANIMATION_WATCHDOG_MS);
    const animation = Animated.sequence([
      motion,
      Animated.delay(TIMING.settleHoldMs),
      timing(exit, 0, TIMING.exitFadeMs),
    ]);
    animation.start(() => {
      if (live) finish();
    });
    return () => {
      live = false;
      clearTimeout(timer);
      clearTimeout(watchdog);
      animation.stop();
    };
  }, [active, foreground, loop, reduceMotion, progress, hookProgress, exit]);

  const ballMotion = {
    opacity: exit,
    transform: [
      { translateY: progress.interpolate({ inputRange: [0, 1, 2, 3], outputRange: [0, MOTION.dipY, MOTION.liftY, 0] }) },
      { rotate: progress.interpolate({ inputRange: [0, 1, 2, 3], outputRange: ['0deg', `${MOTION.dipRotationDeg}deg`, `${MOTION.liftRotationDeg}deg`, '0deg'] }) },
      { scaleX: progress.interpolate({ inputRange: [0, 1, 2, 3], outputRange: [1, MOTION.dipScaleX, MOTION.liftScale, 1] }) },
      { scaleY: progress.interpolate({ inputRange: [0, 1, 2, 3], outputRange: [1, MOTION.dipScaleY, MOTION.liftScale, 1] }) },
    ],
  };
  const hookMotion = {
    opacity: exit,
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
        {reduceMotion ? (
          <Animated.Image
            source={ORIGINAL}
            resizeMode="contain"
            style={[styles.layer, layer, { opacity: exit }]}
          />
        ) : (
          <>
            <Animated.Image source={BALL} resizeMode="contain" style={[styles.layer, layer, ballMotion]} />
            <Animated.Image source={HOOK} resizeMode="contain" style={[styles.layer, layer, hookMotion]} />
          </>
        )}
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
