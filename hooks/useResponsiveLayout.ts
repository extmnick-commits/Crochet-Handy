import { useWindowDimensions } from 'react-native';

import { Breakpoints, Layout } from '@/constants/BambuTheme';

export type LayoutMode = 'compact' | 'medium' | 'expanded';

export type ResponsiveLayout = {
  mode: LayoutMode;
  width: number;
  /** Where the primary navigation lives for this window size. */
  navPosition: 'bottom' | 'left';
  /** Max width for scene content; `undefined` means edge-to-edge. */
  contentMaxWidth: number | undefined;
};

export function getLayoutMode(width: number): LayoutMode {
  if (width >= Breakpoints.expanded) return 'expanded';
  if (width >= Breakpoints.medium) return 'medium';
  return 'compact';
}

/**
 * Window-size classes shared by the navigator and screens.
 *
 * - compact  (< 768):  phones & narrow browsers → Bambu-style bottom tab bar
 * - medium   (≥ 768):  tablets / small laptops  → icon rail + centered column
 * - expanded (≥ 1200): desktops                 → labelled sidebar + wide column
 *
 * Applies on native too, so iPad / Android tablets in landscape get the rail.
 */
export function useResponsiveLayout(): ResponsiveLayout {
  const { width } = useWindowDimensions();
  const mode = getLayoutMode(width);

  return {
    mode,
    width,
    navPosition: mode === 'compact' ? 'bottom' : 'left',
    contentMaxWidth: Layout.contentMaxWidth[mode],
  };
}
