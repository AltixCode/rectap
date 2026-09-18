/**
 * Rectap design tokens.
 *
 * Direction: quiet, high-contrast chrome so the play surface carries all the colour. The
 * platform UI font (SF Pro / Roboto) rather than a webfont: sharpest at small sizes, correct
 * optical sizing, and zero bundle weight — which matters for an app opened for a minute a day.
 */
import { Platform } from 'react-native';

/** 4pt base grid. Every margin and padding in the app comes from here. */
export const spacing = {
  xs: 4, sm: 8, md: 12, base: 16, lg: 20, xl: 24,
  '2xl': 32, '3xl': 40, '4xl': 48, '5xl': 64,
} as const;

export const radius = { xs: 4, sm: 8, md: 12, lg: 16, xl: 22, full: 999 } as const;

/** Minimum interactive size, per Apple HIG (44pt) and Material (48dp). */
export const MIN_TOUCH_TARGET = 44;

export const fontFamily = Platform.select({
  ios: { regular: 'System', mono: 'Menlo' },
  android: { regular: 'sans-serif', mono: 'monospace' },
  default: { regular: 'System', mono: 'monospace' },
}) as { regular: string; mono: string };

/**
 * Type scale. `lineHeight` is absolute (not a multiplier) because React Native multipliers
 * round inconsistently across platforms and break vertical rhythm.
 */
export const typography = {
  display: { fontSize: 34, lineHeight: 40, fontWeight: '700', letterSpacing: -0.8 },
  title: { fontSize: 26, lineHeight: 32, fontWeight: '700', letterSpacing: -0.5 },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: '600', letterSpacing: -0.3 },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400', letterSpacing: -0.1 },
  bodyStrong: { fontSize: 16, lineHeight: 24, fontWeight: '600', letterSpacing: -0.1 },
  callout: { fontSize: 15, lineHeight: 21, fontWeight: '500', letterSpacing: -0.1 },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '500', letterSpacing: 0 },
  micro: { fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0.2 },
  /** Tabular figures keep counters and timers from jittering as they change. */
  numeric: { fontSize: 32, lineHeight: 36, fontWeight: '700', letterSpacing: -1 },
} as const;

export interface Palette {
  /** App background. */
  background: string;
  /** Raised surfaces: cards, sheets, inputs. */
  surface: string;
  /** A surface on top of a surface (chips, segmented controls). */
  surfaceAlt: string;
  /** Primary text. */
  text: string;
  /** Secondary text — verified >= 4.5:1 against `background`. */
  textMuted: string;
  /** Tertiary text for non-essential metadata — >= 3:1, never body copy. */
  textFaint: string;
  /** Hairlines and dividers. */
  border: string;
  /** A stronger border for focus and selection. */
  borderStrong: string;
  /** Brand accent — streaks and the upgrade path. */
  accent: string;
  onAccent: string;
  success: string;
  danger: string;
  onDanger: string;
  /** Scrim behind modals. */
  scrim: string;
  /** Inverted surface used for the primary CTA. */
  inverse: string;
  onInverse: string;
}

export const lightPalette: Palette = {
  background: '#F7F7F5',
  surface: '#FFFFFF',
  surfaceAlt: '#F1F1EE',
  text: '#0C0C0D',
  textMuted: '#5F5F66',
  textFaint: '#85858D',
  border: '#E6E6E1',
  // 3.24:1 against the light background. Use this, not `border`, for the
  // boundary of anything a person has to SEE -- a card, a board cell, a tile.
  borderStrong: '#8A8A82',
  accent: '#BE123C',
  onAccent: '#FFFFFF',
  success: '#059669',
  danger: '#DC2626',
  onDanger: '#FFFFFF',
  scrim: 'rgba(12,12,13,0.45)',
  inverse: '#0C0C0D',
  onInverse: '#FFFFFF',
};

export const darkPalette: Palette = {
  background: '#150A0D',
  surface: '#201216',
  surfaceAlt: '#2C1A20',
  text: '#F4F4F2',
  textMuted: '#A3A3AA',
  textFaint: '#6E6E76',
  border: '#26262A',
  // 3.49:1 against the lightest dark background any app in this portfolio
  // generates, and 3.65:1 against the darkest. It was #3A3A40, which is
  // 1.73:1 -- and `border` is 1.3:1 and `surface` about 1.1:1, so a board
  // drawn with either was invisible in dark mode. That shipped: two live App
  // Store screenshots showed grids with 70%+ of the frame indistinguishable
  // from its own background.
  //
  // `#150A0D` is substituted per app, so a fixed value cannot GUARANTEE 3:1.
  // The test in src/theme/__tests__/color.test.ts is what guarantees it: it
  // is generated into every app and fails there if that app's background
  // makes this value insufficient.
  borderStrong: '#6A6A72',
  accent: '#FB7185',
  onAccent: '#0C0C0D',
  success: '#10B981',
  danger: '#F87171',
  onDanger: '#1A0606',
  scrim: 'rgba(0,0,0,0.6)',
  inverse: '#F4F4F2',
  onInverse: '#0C0C0D',
};

/**
 * Motion. Durations are short and purposeful; exits are faster than entrances because a
 * leaving element should not hold the user up.
 */
export const motion = {
  instant: 90, fast: 150, base: 220, slow: 320,
  spring: { damping: 18, stiffness: 220, mass: 0.9 },
  springBouncy: { damping: 12, stiffness: 260, mass: 0.8 },
} as const;

export const elevation = {
  card: { shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  sheet: { shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 28, shadowOffset: { width: 0, height: -6 }, elevation: 12 },
} as const;

export type ScaledSpacing = Record<keyof typeof spacing, number>;
export type ScaledTypography = Record<keyof typeof typography, (typeof typography)[keyof typeof typography]>;

/**
 * A tablet is not a big phone, and the tokens were written for a phone.
 *
 * At phone sizes these numbers are right and are left exactly alone. On a 13"
 * iPad the same 16pt body text and 16pt gutters produce a screen that is
 * legibly a phone layout being displayed at a distance -- the interface ends
 * around 60% of the way down and the rest is background. Scaling the rhythm
 * rather than stretching the layout is what closes that gap: the content is
 * unchanged, it simply occupies the display it was given.
 *
 * Deliberately modest, and deliberately different per axis. Space grows faster
 * than type (1.25 against 1.15) because the dead area is vertical, and type
 * that grows as fast as its gutters just reproduces the phone screen one size
 * up. Line heights scale with their font size so the ratio is preserved.
 *
 * MIN_TOUCH_TARGET is NOT scaled. 44pt is an Apple HIG floor about fingers,
 * which are the same size on both devices; scaling it would be cargo-culting
 * the multiplier onto a number that does not mean what the others mean.
 */
export const TABLET_MIN_WIDTH = 700;
const TABLET_SPACE_SCALE = 1.25;
const TABLET_TYPE_SCALE = 1.15;

export function scaleSpacing(isTablet: boolean): ScaledSpacing {
  if (!isTablet) return spacing;
  return Object.fromEntries(
    Object.entries(spacing).map(([key, value]) => [key, Math.round(value * TABLET_SPACE_SCALE)]),
  ) as ScaledSpacing;
}

export function scaleTypography(isTablet: boolean): ScaledTypography {
  if (!isTablet) return typography;
  return Object.fromEntries(
    Object.entries(typography).map(([key, style]) => [
      key,
      // The line height is derived from the *rounded* font size, not scaled
      // independently. Rounding both against the raw multiplier lets them land
      // on opposite sides -- body went 16/24 to 18/28, turning a 1.5 ratio into
      // 1.56 and loosening the leading of every paragraph in the app.
      ((scaledFontSize) => ({
        ...style,
        fontSize: scaledFontSize,
        lineHeight: Math.round(scaledFontSize * (style.lineHeight / style.fontSize)),
      }))(Math.round(style.fontSize * TABLET_TYPE_SCALE)),
    ]),
  ) as ScaledTypography;
}
