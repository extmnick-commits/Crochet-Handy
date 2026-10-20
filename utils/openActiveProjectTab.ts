import { InteractionManager } from 'react-native';
import { router } from 'expo-router';

/** Open Active Project after store writes; avoids stale tab UI on iOS. */
export function openActiveProjectTab() {
  InteractionManager.runAfterInteractions(() => {
    router.navigate('/active');
  });
}
