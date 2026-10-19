/**
 * Starts the on-device vision download as soon as the installed app opens.
 * Web and Expo Go skip it. The scan sheet joins this download if it is still running.
 */
import { useEffect } from 'react';

import { prefetchVisionModels } from '@/utils/scrapVisionRun';

export function VisionModelPrefetch() {
  useEffect(() => {
    prefetchVisionModels();
  }, []);
  return null;
}
