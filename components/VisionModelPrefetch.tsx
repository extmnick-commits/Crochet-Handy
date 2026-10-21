/**
 * Optional mount helper — model download is deferred until the user opens Helper
 * (see CrochetHelperHost). Kept for tests or future opt-in warmup.
 */
import { useEffect } from 'react';

import { prefetchHelperModel } from '@/utils/helper/model';

export function VisionModelPrefetch() {
  useEffect(() => {
    prefetchHelperModel();
  }, []);
  return null;
}
