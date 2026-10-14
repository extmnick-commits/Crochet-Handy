import type { RefObject } from 'react';
import { Platform, type ScrollView } from 'react-native';

import { Spacing } from '@/constants/BambuTheme';

/** Scroll a parent ScrollView so a field registered with `y` offset stays above the keyboard. */
export function scrollFieldIntoView(
  scrollRef: RefObject<ScrollView | null>,
  fieldOffsets: Record<string, number>,
  key: string,
  keyboardInset = 0,
) {
  if (Platform.OS === 'web') return;
  const y = fieldOffsets[key];
  if (y == null) return;
  const targetY = Math.max(0, y - Spacing.lg);
  requestAnimationFrame(() => {
    scrollRef.current?.scrollTo({ y: targetY, animated: true });
    if (keyboardInset > 0) {
      setTimeout(() => {
        scrollRef.current?.scrollTo({ y: targetY + Spacing.md, animated: true });
      }, Platform.OS === 'ios' ? 120 : 80);
    }
  });
}
