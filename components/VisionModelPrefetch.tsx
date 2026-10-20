/**
 * Starts the on-device text model download as soon as the installed app opens.
 * Web and Expo Go skip it. A later helper question joins this download if it is still running.
 */
import { useEffect } from 'react';

import { prefetchHelperModel } from '@/utils/helper/model';

export function VisionModelPrefetch() {
  useEffect(() => {
    prefetchHelperModel();
  }, []);
  return null;
}
