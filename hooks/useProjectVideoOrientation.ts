import * as ScreenOrientation from 'expo-screen-orientation';
import { useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * While project video fullscreen is open, allow device rotation; restore portrait otherwise.
 */
export function useProjectVideoOrientation(fullscreen: boolean) {
  useEffect(() => {
    if (Platform.OS === 'web') return undefined;

    const lockPortrait = () =>
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined);

    if (!fullscreen) {
      void lockPortrait();
      return undefined;
    }

    void ScreenOrientation.unlockAsync().catch(() => undefined);
    return () => {
      void lockPortrait();
    };
  }, [fullscreen]);
}
