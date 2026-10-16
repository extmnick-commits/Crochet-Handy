import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import LogoLaunch from '@/components/LogoLaunch';
import { Colors } from '@/constants/BambuTheme';
import { AppLaunchSplashContext } from '@/hooks/useAppLaunchSplash';

void SplashScreen.preventAutoHideAsync().catch(() => {});

const LOGO_READY_FALLBACK_MS = 400;

type Props = { children: ReactNode };

/**
 * Native splash → in-app yarn animation → app content.
 * Does not wait on Firebase or storage; only on layout and the animation itself.
 */
export function AppLaunchGate({ children }: Props) {
  const [layoutReady, setLayoutReady] = useState(false);
  const [logoReady, setLogoReady] = useState(false);
  const [phase, setPhase] = useState<'native' | 'animating' | 'done'>('native');
  const hideStarted = useRef(false);

  const isSplashDone = phase === 'done';

  useEffect(() => {
    const timeout = setTimeout(() => setLogoReady(true), LOGO_READY_FALLBACK_MS);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!layoutReady || !logoReady || hideStarted.current) return;
    hideStarted.current = true;
    setPhase('animating');

    requestAnimationFrame(() => {
      void SplashScreen.hideAsync().catch(() => {});
    });
  }, [layoutReady, logoReady]);

  const onLogoReady = useCallback(() => setLogoReady(true), []);
  const onAnimFinished = useCallback(() => setPhase('done'), []);

  return (
    <AppLaunchSplashContext.Provider value={isSplashDone}>
      <View style={styles.root} onLayout={() => setLayoutReady(true)}>
        {children}
        {phase !== 'done' && (
          <View style={styles.splashLayer} pointerEvents="auto">
            <LogoLaunch
              active={phase === 'animating'}
              onReady={onLogoReady}
              onFinished={onAnimFinished}
            />
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
