import { createContext, useContext } from 'react';

/** True after the yarn launch animation has finished. */
export const AppLaunchSplashContext = createContext(false);

export function useAppLaunchSplashDone(): boolean {
  return useContext(AppLaunchSplashContext);
}
