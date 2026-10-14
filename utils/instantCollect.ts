import { showCollectToast } from '@/components/CollectToast';
import { selectIsPatternCollected, useCrochetStore } from '@/store/useCrochetStore';

/** Instant-save to default collection, or open the folder picker when already collected. */
export function handlePatternCollectPress(patternId: string, onOpenPicker: () => void) {
  const state = useCrochetStore.getState();
  if (selectIsPatternCollected(state, patternId)) {
    onOpenPicker();
    return;
  }
  const folderName = state.collectPatternToDefault(patternId);
  if (!folderName) return;
  showCollectToast({
    patternId,
    folderName,
    onChange: onOpenPicker,
  });
}
