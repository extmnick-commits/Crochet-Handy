import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import LogoLaunch from '@/components/LogoLaunch';
import { Colors } from '@/constants/BambuTheme';
import { AppLaunchSplashContext } from '@/hooks/useAppLaunchSplash';

void SplashScreen.preventAutoHideAsync().catch(() => {});

/** Never block the app if the animation stalls on device. */
const SPLASH_MAX_MS = Platform.OS === 'android' ? 900 : 2200;

type Props = { children: ReactNode };

/**
 * Dark native splash → in-app yarn motion (no duplicate static logo) → app content.
 */
export function AppLaunchGate({ children }: Props) {
  const [phase, setPhase] = useState<'animating' | 'done'>('animating');
  const hideStarted = useRef(false);

  const isSplashDone = phase === 'done';

  useEffect(() => {
    if (Platform.OS === 'android') {
      setPhase('done');
      return undefined;
    }
    const maxSplash = setTimeout(() => setPhase('done'), SPLASH_MAX_MS);
    return () => clearTimeout(maxSplash);
  }, []);

  const onLayout = useCallback(() => {
    if (hideStarted.current) return;
    hideStarted.current = true;
    requestAnimationFrame(() => {
      void SplashScreen.hideAsync().catch(() => {});
    });
  }, []);

  const onAnimFinished = useCallback(() => setPhase('done'), []);

  return (
    <AppLaunchSplashContext.Provider value={isSplashDone}>
      <View style={styles.root} onLayout={onLayout}>
        {children}
        {phase !== 'done' && Platform.OS !== 'android' && (
          <View style={styles.splashLayer} pointerEvents="auto">
            <LogoLaunch active onFinished={onAnimFinished} />
          </View>
        )}
      </View>
    </AppLaunchSplashContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.backgroundPrimary,
  },
  splashLayer: {
    ...StyleSheet.absoluteFill,
    zIndex: 1000,
    elevation: 1000,
  },
});
