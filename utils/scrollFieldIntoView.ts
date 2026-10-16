import type { RefObject } from 'react';
import { Platform, type ScrollView } from 'react-native';

import { Spacing } from '@/constants/BambuTheme';

export type FieldLayout = {
  y: number;
  height: number;
};

type ScrollFieldOptions = {
  viewportHeight: number;
  keyboardInset: number;
  /** Space to leave between the field and the keyboard / bottom edge. */
  bottomGap?: number;
};

/** Scroll a parent ScrollView so a registered field stays above the keyboard. */
export function scrollFieldIntoView(
  scrollRef: RefObject<ScrollView | null>,
  fieldLayouts: Record<string, FieldLayout>,
  key: string,
  { viewportHeight, keyboardInset, bottomGap = Spacing.lg }: ScrollFieldOptions,
) {
  if (Platform.OS === 'web') return;
  const field = fieldLayouts[key];
  if (!field || viewportHeight <= 0) return;

  const visibleHeight = Math.max(120, viewportHeight - keyboardInset);
  const fieldBottom = field.y + field.height;
  const targetY = Math.max(0, fieldBottom - visibleHeight + bottomGap);

  const scroll = () => scrollRef.current?.scrollTo({ y: targetY, animated: true });

  requestAnimationFrame(scroll);
  if (Platform.OS === 'ios') {
    setTimeout(scroll, keyboardInset > 0 ? 50 : 320);
  }
}
