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
  borderStrong: '#CFCFC8',
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
  borderStrong: '#3A3A40',
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
