/**
 * BambuTheme — Crochet Handy design tokens.
 *
 * Mirrors the Bambu Handy visual language: near-black canvas, flat charcoal
 * cards, pill-shaped elevated controls, and a single neon-green accent used
 * sparingly for "live" state (active tab, progress, success, primary CTA).
 *
 * Keep this file framework-agnostic (only `react-native` imports) so it can be
 * consumed by screens, navigators, and non-UI utilities alike.
 */
import { Platform, type TextStyle, type ViewStyle } from 'react-native';

/* -------------------------------------------------------------------------- */
/*                                   Colors                                   */
/* -------------------------------------------------------------------------- */

/** Raw brand palette — the exact Bambu Handy values. Prefer `Colors` in UI code. */
export const Palette = {
  black: '#121212',
  charcoal: '#1C1C1E',
  graphite: '#2A2A2D',
  seam: '#262629',
  neonGreen: '#00E676',
  green: '#00C853',
  white: '#FFFFFF',
  gray: '#8E8E93',
} as const;

/** Semantic color roles. */
export const Colors = {
  /** App canvas behind everything. */
  backgroundPrimary: Palette.black,
  /** Cards, sheets, bottom tab bar. */
  cardSurface: Palette.charcoal,
  /** Buttons, pills, toggles, inputs, and active nav items sitting on a card. */
  elevatedControl: Palette.graphite,

  /** Bambu neon green — active tab, progress fill, primary CTA. */
  accentPrimary: Palette.neonGreen,
  /** Deeper green — pressed state, success labels, gradients. */
  accentSecondary: Palette.green,
  /** Translucent accent for selected pills, focus halos, glows. */
  accentMuted: 'rgba(0, 230, 118, 0.14)',
  accentGlow: 'rgba(0, 230, 118, 0.35)',
  /** Foreground drawn on top of a solid green fill. */
  onAccent: '#04140B',

  textPrimary: Palette.white,
  textSecondary: Palette.gray,
  textTertiary: '#5C5C61',

  border: Palette.seam,
  divider: Palette.seam,

  // Status — tuned to sit next to the neon accent on a dark canvas.
  success: Palette.green,
  warning: '#FFB020',
  danger: '#FF5A4E',
  info: '#4DA3FF',

  /** Live / recording dot (Snapchat-style story capture). */
  live: '#FF3B30',
  scrim: 'rgba(0, 0, 0, 0.6)',
  transparent: 'transparent',
} as const;

export type ColorToken = keyof typeof Colors;

/* -------------------------------------------------------------------------- */
/*                              Spacing & Radius                              */
/* -------------------------------------------------------------------------- */

/** 4pt grid. Bambu uses a 16pt screen gutter and 12pt gaps between cards. */
export const Spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
} as const;

export const Radius = {
  xs: 4,
  sm: 8,
  /** Standard card radius (print status card, device control tiles). */
  md: 12,
  /** Camera / media hero radius. */
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

/* -------------------------------------------------------------------------- */
/*                                 Typography                                 */
/* -------------------------------------------------------------------------- */

/**
 * Bambu Handy ships with the platform system face (SF Pro / Roboto), so we do
 * too — zero font-loading cost and a native feel on each OS.
 */
export const FontFamily = {
  regular: Platform.select({
    ios: 'System',
    android: 'sans-serif',
    web: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    default: 'System',
  }),
  medium: Platform.select({
    ios: 'System',
    android: 'sans-serif-medium',
    web: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    default: 'System',
  }),
  mono: Platform.select({
    ios: 'Menlo',
    android: 'monospace',
    web: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    default: 'monospace',
  }),
} as const;

export const FontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const satisfies Record<string, TextStyle['fontWeight']>;

/** Type ramp sampled from Bambu Handy screens. */
export const Typography = {
  /** Big live numbers — nozzle temp, row counter. */
  metric: { fontFamily: FontFamily.medium, fontSize: 34, lineHeight: 40, fontWeight: FontWeight.semibold, letterSpacing: -0.5 },
  /** Screen titles ("Device Control", "Filament"). */
  title: { fontFamily: FontFamily.medium, fontSize: 22, lineHeight: 28, fontWeight: FontWeight.bold, letterSpacing: -0.2 },
  /** Section headers. */
  headline: { fontFamily: FontFamily.medium, fontSize: 18, lineHeight: 24, fontWeight: FontWeight.semibold },
  /** Card titles ("Yarn-O-Matic: yarn winder"). */
  subhead: { fontFamily: FontFamily.medium, fontSize: 16, lineHeight: 22, fontWeight: FontWeight.semibold },
  body: { fontFamily: FontFamily.regular, fontSize: 15, lineHeight: 21, fontWeight: FontWeight.regular },
  /** Secondary card copy ("0.2mm layer, 2 walls…"). */
  callout: { fontFamily: FontFamily.regular, fontSize: 13, lineHeight: 18, fontWeight: FontWeight.regular },
  /** Button labels. */
  label: { fontFamily: FontFamily.medium, fontSize: 15, lineHeight: 20, fontWeight: FontWeight.semibold },
  caption: { fontFamily: FontFamily.regular, fontSize: 12, lineHeight: 16, fontWeight: FontWeight.regular },
  /** Bottom tab labels. */
  tab: { fontFamily: FontFamily.medium, fontSize: 11, lineHeight: 14, fontWeight: FontWeight.medium },
} as const satisfies Record<string, TextStyle>;

export type TypographyToken = keyof typeof Typography;

/* -------------------------------------------------------------------------- */
/*                                 Elevation                                  */
/* -------------------------------------------------------------------------- */

/**
 * Bambu surfaces are flat; depth comes from tone (#121212 → #1C1C1E → #2A2A2D),
 * not shadow. Shadows are reserved for floating elements (FABs, sheets, toasts).
 */
export const Elevation = {
  none: {},
  floating: Platform.select<ViewStyle>({
    web: { boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)' },
    default: {
      shadowColor: '#000',
      shadowOpacity: 0.45,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 12,
    },
  }),
  /** Green halo for the primary floating action (e.g. capture-progress button). */
  accentGlow: Platform.select<ViewStyle>({
    web: { boxShadow: `0 0 0 1px ${Colors.accentMuted}, 0 6px 22px ${Colors.accentGlow}` },
    default: {
      shadowColor: Colors.accentPrimary,
      shadowOpacity: 0.45,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 4 },
      elevation: 10,
    },
  }),
} as const;

/* -------------------------------------------------------------------------- */
/*                              Layout & Motion                               */
/* -------------------------------------------------------------------------- */

/** Width breakpoints (dp / CSS px). */
export const Breakpoints = {
  /** ≥ 768: tablets & small laptops → compact navigation rail. */
  medium: 768,
  /** ≥ 1200: desktops → full labelled sidebar. */
  expanded: 1200,
} as const;

export const Layout = {
  screenGutter: Spacing.lg,
  cardGap: Spacing.md,
  hairline: Platform.select({ web: 1, default: 0.5 }),

  /** Bottom tab bar content height (safe-area inset is added on top of this). */
  tabBarHeight: 56,
  tabIconSize: 26,
  /** Medium layout: icon + label rail. */
  railWidth: 88,
  /** Expanded layout: labelled sidebar. */
  sidebarWidth: 256,

  /** Max readable width of the scene next to the rail / sidebar. */
  contentMaxWidth: {
    compact: undefined,
    medium: 760,
    expanded: 1120,
  },
  hitSlop: { top: 8, bottom: 8, left: 8, right: 8 },
} as const;

export const Motion = {
  fast: 120,
  normal: 200,
  slow: 320,
  /** Spring used for tab-icon "pop" on selection. */
  spring: { damping: 14, stiffness: 260, mass: 0.6 },
} as const;

/* -------------------------------------------------------------------------- */
/*                               Aggregate theme                              */
/* -------------------------------------------------------------------------- */

export const BambuTheme = {
  palette: Palette,
  colors: Colors,
  spacing: Spacing,
  radius: Radius,
  fontFamily: FontFamily,
  fontWeight: FontWeight,
  typography: Typography,
  elevation: Elevation,
  breakpoints: Breakpoints,
  layout: Layout,
  motion: Motion,
} as const;

export type BambuThemeType = typeof BambuTheme;

export default BambuTheme;
